const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");
const { getContractAddress } = require("@ethersproject/address");

describe("Contract: KapVesting", () => {
  before(async () => {
    VESTING_CREATOR = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("VESTING_CREATOR")
    );
    REGISTRY_SETTER = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("REGISTRY_SETTER")
    );
    Token = await ethers.getContractFactory("Token");
    Vesting = await ethers.getContractFactory("KapVesting");
    Governance = await ethers.getContractFactory("Governance");
    GovernanceRegistry = await ethers.getContractFactory("GovernanceRegistry");

    [
      deployer,
      teamMultisig,
      foundationMultisig,
      unauthorizedSource,
      user1,
      user2,
      user3,
      user4,
      fillerLPSource,
      _,
    ] = await ethers.getSigners();

    oneWeek = 60 * 60 * 24 * 7;
    weeks52 = 52 * oneWeek;
    VESTING_PERIOD = weeks52;
  });
  beforeEach(async () => {
    token = await Token.deploy();
    const transactionCount = await deployer.getTransactionCount();
    expectedVestingAddress = getContractAddress({
        from: deployer.address,
        nonce: transactionCount + 2,
    });
    governance = await Governance.deploy(
      expectedVestingAddress,
      foundationMultisig.address
    );
    VOTING_PERIOD = parseInt(await governance.votingPeriod());
    governanceRegistry = await GovernanceRegistry.deploy(governance.address);
    vesting = await Vesting.deploy(
      teamMultisig.address,
      foundationMultisig.address,
      token.address
    );
    await token.transfer(teamMultisig.address, (await token.totalSupply()).div(ethers.BigNumber.from("3")));
    await token.connect(teamMultisig).approve(vesting.address, ethers.constants.MaxUint256);  
    await token.transfer(foundationMultisig.address, (await token.totalSupply()).div(ethers.BigNumber.from("3")));
    await token.connect(foundationMultisig).approve(vesting.address, ethers.constants.MaxUint256);
  });
  describe("Deployment", () => {
    it("Should assign correct KAP token", async () => {
      expect(await vesting.kapToken()).to.equal(token.address);
    });
    it("Team multisig has role VESTING_CREATOR", async () => {
      expect(await vesting.hasRole(VESTING_CREATOR, teamMultisig.address)).to.be
        .true;
    });
    it("Foundation multisig has role VESTING_CREATOR", async () => {
      expect(await vesting.hasRole(VESTING_CREATOR, foundationMultisig.address)).to.be
        .true;
    });
    it("Foundation multisig has role REGISTRY_SETTER", async () => {
      expect(await vesting.hasRole(REGISTRY_SETTER, foundationMultisig.address)).to.be
        .true;
    });
    it("Should revert if team multisig address is zero", async () => {
      await expect(
        Vesting.deploy(
          ethers.constants.AddressZero,
          foundationMultisig.address,
          token.address
        )
      ).to.be.revertedWith("Zero address");
    }); 
    it("Should revert if foundation multisig address is zero", async () => {
      await expect(
        Vesting.deploy(
          teamMultisig.address,
          ethers.constants.AddressZero,
          token.address
        )
      ).to.be.revertedWith("Zero address");
    }); 
    it("Should revert if token address is zero", async () => {
      await expect(
        Vesting.deploy(
          teamMultisig.address,
          foundationMultisig.address,
          ethers.constants.AddressZero
        )
      ).to.be.revertedWith("Zero address");
    });
  });
  describe("Set Governance Registry", () => {
    it("Should start as zero address", async () => {
        expect(
            await vesting.governanceRegistry()
        ).to.equal(ethers.constants.AddressZero);
    });
    describe("When setRegistry is called by the foundation multisig", async () => {
        it("Should update the address", async () => {
            await vesting.connect(foundationMultisig).setRegistry(
                governanceRegistry.address
            );
            expect(
                await vesting.governanceRegistry()
            ).to.equal(governanceRegistry.address);
            expect(
                await vesting.governanceRegistry()
            ).to.not.equal(ethers.constants.AddressZero);
        });
        it("Should revert if zero address is provided", async () => {
            await expect(vesting.connect(foundationMultisig).setRegistry(
                ethers.constants.AddressZero
            )).to.be.revertedWith("Zero address");
        });
    });
    describe("When setRegistry is called by an unauthorized source", async () => {
        it("Should revert, AccessControl", async () => {
            await expect(vesting.connect(unauthorizedSource).setRegistry(
                governanceRegistry.address
            )).to.be.revertedWith("AccessControl");
        });
    });
  });
  describe("Transactions", () => {
    beforeEach(async () => {
        await vesting.connect(foundationMultisig).setRegistry(
            governanceRegistry.address
        );
    });
    describe("createVestingAgreement", () => {
      async function verifyVestingAgreementCreated(
        beneficiary,
        vestStart,
        VESTING_PERIOD,
        totalAmount
      ) {
        vestingAgreement = await vesting.vestingAgreements(beneficiary, 0);
        expect(vestingAgreement.vestStart).to.equal(vestStart);
        expect(vestingAgreement.vestPeriod).to.equal(VESTING_PERIOD);
        expect(vestingAgreement.totalAmount).to.equal(totalAmount);
        expect(vestingAgreement.amountCollected).to.be.equal(0);
      }
      async function verifyBalanceUpdate(beneficiary, totalAmount) {
        expect(await vesting.balances(beneficiary)).to.equal(totalAmount);
      }
      beforeEach(async () => {
        beneficiary = user1.address;
        delegate = user2.address;
        await vesting.connect(user1).appointDelegate(delegate);
        totalAmount = BigNumber.from(10).pow(await token.decimals());

        await token.connect(foundationMultisig).transfer(unauthorizedSource.address, totalAmount);
        await token
          .connect(foundationMultisig)
          .approve(vesting.address, ethers.constants.MaxUint256);
        await token
          .connect(unauthorizedSource)
          .approve(vesting.address, ethers.constants.MaxUint256);
      });
      describe("Require statements", () => {
        it("Should revert when beneficiary is zero address", async () => {
          const executionTimestamp = (await ethers.provider.getBlock()).timestamp + 1;
          await expect(
            vesting.connect(foundationMultisig).createVestingAgreement(
              ethers.constants.AddressZero,
              executionTimestamp,
              VESTING_PERIOD,
              totalAmount
            )
          ).to.be.revertedWith("Zero address");
        });
        it("Should revert when vest start is before block timestamp", async () => {
          const executionTimestamp = (await ethers.provider.getBlock()).timestamp + 1;
          await expect(
            vesting.connect(foundationMultisig).createVestingAgreement(
              beneficiary,
              executionTimestamp - 1,
              VESTING_PERIOD,
              totalAmount
            )
          ).to.be.revertedWith("Invalid vest start");
        });
        it("Should revert when vest period is zero", async () => {
          const executionTimestamp = (await ethers.provider.getBlock()).timestamp + 1;
          await expect(
            vesting.connect(foundationMultisig).createVestingAgreement(
              beneficiary,
              executionTimestamp,
              0,
              totalAmount
            )
          ).to.be.revertedWith("Invalid vest period");
        });
        it("Should revert when amount is zero", async () => {
          const executionTimestamp = (await ethers.provider.getBlock()).timestamp + 1;
          await expect(
            vesting.connect(foundationMultisig).createVestingAgreement(
              beneficiary,
              executionTimestamp,
              VESTING_PERIOD,
              0
            )
          ).to.be.revertedWith("Invalid amount");
        });
      });
      describe("When called by the team multisig", () => {
        beforeEach(async () => {
          currentTimestamp = (await ethers.provider.getBlock()).timestamp;
          vestDelay = oneWeek;
          vestStart = currentTimestamp + vestDelay;
          await vesting
            .connect(teamMultisig)
            .createVestingAgreement(beneficiary, vestStart, VESTING_PERIOD, totalAmount);
        });
        it("Should transfer KAP to vesting contract", async () => {
          expect(await token.balanceOf(vesting.address)).to.equal(totalAmount);
        });
        it("Should update balance", async () => {
          await verifyBalanceUpdate(beneficiary, totalAmount);
        });
        it("Should create a vesting agreement", async () => {
          await verifyVestingAgreementCreated(
            beneficiary,
            vestStart,
            VESTING_PERIOD,
            totalAmount
          );
        });
        it("Should only update delegate's voting weight", async () => {
          expect(await vesting.votingWeight(delegate)).to.equal(totalAmount);
          expect(await vesting.votingWeight(beneficiary)).to.equal(0);
        });
      });
      describe("When called by the foundation multisig", () => {
        beforeEach(async () => {
          currentTimestamp = (await ethers.provider.getBlock()).timestamp;
          vestDelay = oneWeek;
          vestStart = currentTimestamp + vestDelay;
          await vesting
            .connect(foundationMultisig)
            .createVestingAgreement(beneficiary, vestStart, VESTING_PERIOD, totalAmount);
        });
        it("Should transfer KAP to vesting contract", async () => {
          expect(await token.balanceOf(vesting.address)).to.equal(totalAmount);
        });
        it("Should update balance", async () => {
          await verifyBalanceUpdate(beneficiary, totalAmount);
        });
        it("Should create a vesting agreement", async () => {
          await verifyVestingAgreementCreated(
            beneficiary,
            vestStart,
            VESTING_PERIOD,
            totalAmount
          );
        });
        it("Should only update delegate's voting weight", async () => {
          expect(await vesting.votingWeight(delegate)).to.equal(totalAmount);
          expect(await vesting.votingWeight(beneficiary)).to.equal(0);
        });
      });
      describe("When called by an unauthorized source", () => {
        it("Should revert, Access denied", async () => {
          await expect(
            vesting
              .connect(unauthorizedSource)
              .createVestingAgreement(beneficiary, vestStart, VESTING_PERIOD, totalAmount)
          ).to.be.revertedWith(
            "AccessControl: account " +
              unauthorizedSource.address.toLowerCase() +
              " is missing role " +
              VESTING_CREATOR
          );
        });
      });
    });
    describe("collect", () => {
      beforeEach(async () => {
        beneficiary = user1.address;
        delegate = user2.address;
        await vesting.connect(user1).appointDelegate(delegate);

        totalAmount = BigNumber.from(10).pow(await token.decimals());
        currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        vestDelay = oneWeek;
        vestStart = currentTimestamp + vestDelay;
        await vesting.connect(foundationMultisig).createVestingAgreement(
          beneficiary,
          vestStart,
          VESTING_PERIOD,
          totalAmount
        );
        vestingAgreementCreationTimestamp = (await ethers.provider.getBlock()).timestamp;
      });
      describe("When the beneficiary attempts to collect before vestStart", () => {
        it("Should revert, Vesting not started", async () => {
          await ethers.provider.send("evm_setNextBlockTimestamp", [
            vestingAgreementCreationTimestamp + vestDelay - 1
          ]);
          await expect(vesting.connect(user1).collect(0)).to.be.revertedWith(
            "Not started"
          );
        });
      });
      describe("When the beneficiary collects one second after vestStart", () => {
        describe("If the agreemend Id is invalid", async () => {
          it("Should revert", async () => {
            await expect(
              vesting.connect(user1).collect(1)
            ).to.be.revertedWith("Invalid Id");
          });
        });
        beforeEach(async () => {
          oneSecondOfKap = Math.floor(totalAmount / weeks52);
          await ethers.provider.send("evm_setNextBlockTimestamp", [
            vestingAgreementCreationTimestamp + vestDelay
          ]);
          await vesting.connect(user1).collect(0);
          vestingAgreement = await vesting.vestingAgreements(beneficiary, 0);
        });
        it("Beneficiary should collect 1 second worth of KAP", async () => {
          expect(await token.balanceOf(beneficiary)).to.equal(oneSecondOfKap);
        });
        it("Collected amount should increase 1 second worth of KAP", async () => {
          expect(vestingAgreement.amountCollected).to.equal(oneSecondOfKap);
        });
        it("Balance should decrease by 1 second worth of KAP", async () => {
          expect(await vesting.balances(beneficiary)).to.equal(
            totalAmount.sub(BigNumber.from(oneSecondOfKap))
          );
        });
        it("Delegate voting weight should decrease equivalently with balance", async () => {
          expect(await vesting.votingWeight(delegate)).to.equal(
            totalAmount.sub(BigNumber.from(oneSecondOfKap))
          );
        });
      });
      describe("When the beneficiary collects 51 weeks after vestStart", () => {
        beforeEach(async () => {
          Weeks51OfKap = BigNumber.from(totalAmount)
            .mul(BigNumber.from(oneWeek * 51))
            .div(BigNumber.from(weeks52));
          await ethers.provider.send("evm_setNextBlockTimestamp", [
            vestingAgreementCreationTimestamp + vestDelay + oneWeek * 51 - 1,
          ]);
          await vesting.connect(user1).collect(0);
          vestingAgreement = await vesting.vestingAgreements(beneficiary, 0);
        });
        it("Beneficiary should collect 51 weeks worth of KAP", async () => {
          expect(await token.balanceOf(beneficiary)).to.equal(Weeks51OfKap);
        });
        it("Collected amount should increase 51 weeks worth of KAP", async () => {
          expect(vestingAgreement.amountCollected).to.equal(Weeks51OfKap);
        });
        it("Balance should decrease by 51 weeks worth of KAP", async () => {
          expect(await vesting.balances(beneficiary)).to.equal(
            totalAmount.sub(BigNumber.from(Weeks51OfKap))
          );
        });
        it("Delegate voting weight should decrease equivalently with balance", async () => {
          expect(await vesting.votingWeight(delegate)).to.equal(
            totalAmount.sub(BigNumber.from(Weeks51OfKap))
          );
        });
      });
      describe("When the beneficiary collects 52 weeks after vestStart", () => {
        beforeEach(async () => {
          await ethers.provider.send("evm_setNextBlockTimestamp", [
            vestingAgreementCreationTimestamp + vestDelay + weeks52 - 1,
          ]);
          await vesting.connect(user1).collect(0);
          vestingAgreement = await vesting.vestingAgreements(beneficiary, 0);
        });
        it("Beneficiary should collect the total amount of KAP", async () => {
          expect(await token.balanceOf(beneficiary)).to.equal(totalAmount);
        });
        it("Collected amount should increase by total amount", async () => {
          expect(vestingAgreement.amountCollected).to.equal(totalAmount);
        });
        it("Balance should go to zero", async () => {
          expect(await vesting.balances(beneficiary)).to.equal(0);
        });
        it("Delegate voting weight should decrease equivalently with balance", async () => {
          expect(await vesting.votingWeight(delegate)).to.equal(0);
        });
        describe("When the beneficiary collects again after already receiving full collection", () => {
          it("Should revert, Collection limit reached", async () => {
            await expect(vesting.connect(user1).collect(0)).to.be.revertedWith(
              "Collection limit"
            );
          });
        });
      });
      describe("When the beneficiary collects 60 weeks after vestStart", () => {
        beforeEach(async () => {
          await ethers.provider.send("evm_setNextBlockTimestamp", [
            vestingAgreementCreationTimestamp + vestDelay + oneWeek * 60 - 1,
          ]);
          await vesting.connect(user1).collect(0);
          vestingAgreement = await vesting.vestingAgreements(beneficiary, 0);
        });
        it("Beneficiary should collect the total amount of KAP", async () => {
          expect(await token.balanceOf(beneficiary)).to.equal(totalAmount);
        });
        it("Collected amount should increase by total amount", async () => {
          expect(vestingAgreement.amountCollected).to.equal(totalAmount);
        });
        it("Balance should go to zero", async () => {
          expect(await vesting.balances(beneficiary)).to.equal(0);
        });
        it("Delegate voting weight should decrease equivalently with balance", async () => {
          expect(await vesting.votingWeight(delegate)).to.equal(0);
        });
      });
      describe("After a user collects on a weekly basis for the entire 52 weeks", async () => {
        beforeEach(async () => {
          await ethers.provider.send("evm_setNextBlockTimestamp", [
            vestingAgreementCreationTimestamp + vestDelay + oneWeek
          ]);
          weekCount = 1;
          while (weekCount <= 52) {
            balanceBefore = await token.balanceOf(beneficiary);
            await vesting.connect(user1).collect(0);
            balanceAfter = await token.balanceOf(beneficiary);
            await ethers.provider.send("evm_increaseTime", [oneWeek]);
            weekCount++;
          }
          vestingAgreement = await vesting.vestingAgreements(beneficiary, 0);
        });
        it("Total amount should have been collected", async () => {
          expect(vestingAgreement.amountCollected).to.equal(totalAmount);
          // Total amount should have been received by beneficiary
          expect(await token.balanceOf(beneficiary)).to.equal(totalAmount);
          // Collection limit should be reached
          await expect(
            vesting.connect(user1).collect(0)
          ).to.be.revertedWith("Collection limit");
          // and after 10 more years the collection limit is still reached
          await ethers.provider.send("evm_increaseTime", [10 * 52 * oneWeek]);
          await expect(
            vesting.connect(user1).collect(0)
          ).to.be.revertedWith("Collection limit");
          // User's balance should be 0
          expect(await vesting.balances(beneficiary)).to.equal(0);
          // Delegate's voting weight should be 0 (provided the user is the delegate's only constituent)
          expect(await vesting.votingWeight(delegate)).to.equal(0);
        });
      });
    });
    describe("appointDelegate", () => {
      it("Should revert when new delegate is zero address", async () => {
        await expect(
          vesting.appointDelegate(ethers.constants.AddressZero)
        ).to.be.revertedWith("Zero address");
      });
      it("The delegate of a user defaults to the zero address", async () => {
        expect(await vesting.delegates(user1.address)).to.be.equal(
          ethers.constants.AddressZero
        );
      });
      describe("When a user appoints a delegate", () => {
        it("Should updates the delegates mapping accordingly", async () => {
          await vesting.connect(user1).appointDelegate(user2.address);
          expect(await vesting.delegates(user1.address)).to.equal(
            user2.address
          );
        });
      });
      describe("When a user has an active vesting agreement and a delegate", () => {
        beforeEach(async () => {
          beneficiary = user1.address;
          newDelegate = user3.address;
          totalAmount = BigNumber.from(10).pow(await token.decimals());
          currentTimestamp = (await ethers.provider.getBlock()).timestamp;
          vestDelay = oneWeek;
          vestStart = currentTimestamp + vestDelay;
          await vesting.connect(foundationMultisig).createVestingAgreement(
            beneficiary,
            vestStart,
            VESTING_PERIOD,
            totalAmount
          );

          await vesting.connect(user1).appointDelegate(user2.address);
        });
        describe("When the user appoints a new delegate without undelegating", () => {
          it("Should revert, Must undelegate first", async () => {
            await expect(
              vesting.connect(user1).appointDelegate(newDelegate)
            ).to.be.revertedWith("Must undelegate first");
          });
        });
        describe("When the user undelegates", () => {
          beforeEach(async () => {
            await vesting.connect(user1).undelegate();
            undelegateTimestamp = (await (ethers.provider.getBlock())).timestamp;
          });
          it("The last undelegated timestamp should be correct", async () => {
            expect(undelegateTimestamp).to.equal(await vesting.lastUndelegated(user1.address));
          });
          it("The delegate should become zero", async () => {
            expect(await vesting.delegates(user1.address)).to.equal(ethers.constants.AddressZero);
          })
          describe("When the user undelegates again", () => {
            it("Should revert, Delegate already zero", async () => {
              await expect(
                vesting.connect(user1).undelegate()
              ).to.be.revertedWith("Delegate already zero");
            });
            describe("When the user appoints a new delegate before waiting more than voting period", () => {
              it("Should revert, Undelegate cooldown", async () => {
                await ethers.provider.send("evm_setNextBlockTimestamp", [
                  undelegateTimestamp + VOTING_PERIOD
                ]);
                await expect(
                  vesting.connect(user1).appointDelegate(newDelegate)
                ).to.be.revertedWith("Undelegate cooldown");
              });
            });
            describe("When the user appoints a new delegate after waiting more than voting period", () => {
              beforeEach(async () => {
                oldDelegate = user2.address;
                newDelegate = user3.address;
                await ethers.provider.send("evm_setNextBlockTimestamp", [
                  undelegateTimestamp + VOTING_PERIOD + 1
                ]);
                await vesting.connect(user1).appointDelegate(newDelegate);
              });
              it("Voting weight should be transferred from old delegate to new delegate", async () => {
                expect(await vesting.delegates(user1.address)).to.equal(newDelegate);
                expect(await vesting.votingWeight(oldDelegate)).to.equal(0);
                expect(await vesting.votingWeight(newDelegate)).to.equal(totalAmount);
              });
            });
          });
        });
        describe("When another user appoints the same delegate", () => {
          beforeEach(async () => {
            commonDelegate = user2.address;
            otherBeneficiary = user3.address;
            await vesting.connect(user3).appointDelegate(commonDelegate);
          });
          describe("When the other user with the same delegate is the beneficiary of a vesting agreement", async () => {
            beforeEach(async () => {
              otherTotalAmount = totalAmount.add(BigNumber.from(1));
              await vesting.connect(foundationMultisig).createVestingAgreement(
                otherBeneficiary,
                vestStart,
                VESTING_PERIOD,
                otherTotalAmount
              );
              user1Balance = await vesting.balances(user1.address);
              user3Balance = await vesting.balances(user3.address);
            });
            it("The common delegate should have weight equal to the sum of both constituent balances", async () => {
              delegateWeight = await vesting.votingWeight(commonDelegate);
              expect(user1Balance).to.equal(totalAmount);
              expect(user3Balance).to.equal(otherTotalAmount);
              expect(delegateWeight).to.equal(user1Balance.add(user3Balance));
            });
            describe("When the other user changes their delegate, by undelegating and waiting more than voting period", () => {
              beforeEach(async () => {
                await vesting.connect(user3).undelegate();
                undelegateTimestamp = (await (ethers.provider.getBlock())).timestamp;
                await ethers.provider.send("evm_setNextBlockTimestamp", [
                  undelegateTimestamp + VOTING_PERIOD + 1
                ]);
                await vesting.connect(user3).appointDelegate(user4.address);
              });
              it("The previously common delegate's voting weight should decrease only by the other user's balance", async () => {
                expect(await vesting.votingWeight(commonDelegate)).to.equal(
                  user1Balance
                );
              });
            });
          });
        });
      });
    });
  });
});
