const { expect } = require("chai");
const { BigNumber } = require("ethers");

describe("Contract: RewardsLocker", () => {
  beforeEach(async () => {
    Token = await ethers.getContractFactory("Token");
    RewardsLocker = await ethers.getContractFactory("RewardsLocker");
    GovernanceRegistry = await ethers.getContractFactory("GovernanceRegistry");

    [
      deployer,
      stakingPool,
      unofficialStakingPool,
      governance,
      teamMultisig,
      user1,
      user2,
      user3,
      _,
    ] = await ethers.getSigners();

    token = await Token.deploy();
    governanceRegistry = await GovernanceRegistry.deploy(governance.address);
    rewardsLocker = await RewardsLocker.deploy(
      stakingPool.address,
      governanceRegistry.address,
      token.address,
      teamMultisig.address
    );
  });
  describe("Deployment", () => {
    it("Should assign correct contract addresses", async () => {
      expect(await rewardsLocker.governanceRegistry()).to.equal(
        governanceRegistry.address
      );
      expect(await rewardsLocker.kapToken()).to.equal(token.address);
      const LOCK_CREATOR = await rewardsLocker.LOCK_CREATOR();
      const KAP_SAVER = await rewardsLocker.KAP_SAVER();
      expect(await rewardsLocker.hasRole(LOCK_CREATOR, stakingPool.address)).to.be.true;
      expect(await rewardsLocker.getRoleMemberCount(LOCK_CREATOR)).to.equal(1);
      expect(await rewardsLocker.hasRole(KAP_SAVER, teamMultisig.address));
      expect(await rewardsLocker.getRoleMemberCount(KAP_SAVER)).to.equal(1);
    });
    it("Should revert for invalid addresses", async () => {
      await expect(
        RewardsLocker.deploy(
          ethers.constants.AddressZero,
          governanceRegistry.address,
          token.address,
          teamMultisig.address
        )
      ).to.be.revertedWith("Zero address");
      await expect(
        RewardsLocker.deploy(
          stakingPool.address,
          ethers.constants.AddressZero,
          token.address,
          teamMultisig.address
        )
      ).to.be.revertedWith("Zero address");
      await expect(
        RewardsLocker.deploy(
          stakingPool.address,
          governanceRegistry.address,
          ethers.constants.AddressZero,
          teamMultisig.address
        )
      ).to.be.revertedWith("Zero address");
      await expect(
        RewardsLocker.deploy(
          stakingPool.address,
          governanceRegistry.address,
          token.address,
          ethers.constants.AddressZero
        )
      ).to.be.revertedWith("Zero address");
    });
  });
  describe("Transactions", () => {
    describe("createLockAgreement", () => {
      async function verifyLockAgreementCreated(
        transactionTimestamp,
        beneficiary,
        amount
      ) {
        lockAgreement = await rewardsLocker.lockAgreements(beneficiary, 0);
        expect(lockAgreement.availableTimestamp).to.equal(
          transactionTimestamp + weeks52
        );
        expect(lockAgreement.amount).to.equal(amount);
        expect(lockAgreement.collected).to.be.false;
      }
      async function verifyVotingWeightUpdate(beneficiary, amount) {
        expect(await rewardsLocker.votingWeight(beneficiary)).to.equal(amount);
      }
      beforeEach(async () => {
        beneficiary = user1.address;
        amount = BigNumber.from(10).pow(await token.decimals());
        weeks52 = 60 * 60 * 24 * 7 * 52;
      });
      describe("When called from the staking contract", () => {
        beforeEach(async () => {
          await rewardsLocker
            .connect(stakingPool)
            .createLockAgreement(beneficiary, amount);
        });
        it("Should create a lock agreement", async () => {
          verifyLockAgreementCreated(
            (await ethers.provider.getBlock()).timestamp,
            beneficiary,
            amount
          );
        });
        it("Should update voting weight", async () => {
          verifyVotingWeightUpdate(beneficiary, amount);
        });
        it("Beneficiary should have exactly 1 lock agreement", async () => {
          expect(
            (await rewardsLocker.getLockAgreements(beneficiary)).length
          ).to.equal(1);
        });
      });
      describe("When called from a non-staking-pool address", () => {
        it("Should revert, Access denied", async () => {
          const LOCK_CREATOR = await rewardsLocker.LOCK_CREATOR();
          await expect(
            rewardsLocker
              .connect(unofficialStakingPool)
              .createLockAgreement(beneficiary, amount)
          ).to.be.revertedWith(
            `AccessControl: account ${unofficialStakingPool.address.toLowerCase()} is missing role ${LOCK_CREATOR}`
          );
        });
      });
      describe("When creating new agreement", () => {
        it("Should update totalVotingWeight correctly", async () => {
          oldtotalVotingWeight = await rewardsLocker.totalVotingWeight()
          await rewardsLocker
            .connect(stakingPool)
            .createLockAgreement(user1.address, BigNumber.from(13).mul(BigNumber.from(10).pow(18)));
          await rewardsLocker
            .connect(stakingPool)
            .createLockAgreement(user3.address, BigNumber.from(3100).mul(BigNumber.from(10).pow(18)));
          newtotalVotingWeight = await rewardsLocker.totalVotingWeight();
          expect(newtotalVotingWeight.sub(oldtotalVotingWeight))
            .to.be.equal(BigNumber.from(3113).mul(BigNumber.from(10).pow(18)))
        });
      });
    });
    describe("collectRewards", () => {
      beforeEach(async () => {
        beneficiary = user1.address;
        amount = BigNumber.from(10).pow(await token.decimals());
        await token.transfer(rewardsLocker.address, amount);
        weeks52 = 60 * 60 * 24 * 7 * 52;
        await rewardsLocker
          .connect(stakingPool)
          .createLockAgreement(beneficiary, amount);
      });
      describe("When the beneficiary collects before 52 weeks", () => {
        it("Should revert, Collection too early", async () => {
          await ethers.provider.send("evm_increaseTime", [weeks52 - 2]);
          await expect(
            rewardsLocker.connect(user1).collectRewards(0)
          ).to.be.revertedWith("Too early");
        });
      });
      describe("When the beneficiary collects after 52 weeks", () => {
        beforeEach(async () => {
          await ethers.provider.send("evm_increaseTime", [weeks52]);
          await rewardsLocker.connect(user1).collectRewards(0);
        });
        describe("If the lock agreement Id is invalid", () => {
          it("Should revert if invalid lock agreement Id", async () => {
            await expect(
              rewardsLocker.connect(user1).collectRewards(1)
            ).to.be.revertedWith("Invalid Id");
          });
        });
        it("Should transfer rewards to beneficiary", async () => {
          expect(await token.balanceOf(beneficiary)).to.equal(amount);
          expect(await token.balanceOf(rewardsLocker.address)).to.equal(0);
        });
        it("Should update collected to true", async () => {
          lockAgreement = await rewardsLocker.lockAgreements(beneficiary, 0);
          expect(lockAgreement.collected).to.be.true;
        });
        it("Should update voting weight", async () => {
          expect(await rewardsLocker.votingWeight(beneficiary)).to.equal(0);
        });
        it("Should revert if beneficiary attempts to collect again, Already collected", async () => {
          await expect(
            rewardsLocker.connect(user1).collectRewards(0)
          ).to.be.revertedWith("Already collected");
        });
      });
      describe("When collecting rewards", () => {
        beforeEach(async () => {
          await rewardsLocker
            .connect(stakingPool)
            .createLockAgreement(user1.address, BigNumber.from(13).mul(BigNumber.from(10).pow(18)));
          await rewardsLocker
            .connect(stakingPool)
            .createLockAgreement(user3.address, BigNumber.from(3100).mul(BigNumber.from(10).pow(18)));

          await ethers.provider.send("evm_increaseTime", [weeks52]);
          await token.transfer(rewardsLocker.address, BigNumber.from(3370).mul(BigNumber.from(10).pow(18)));
        });
        it("Should update totalVotingWeight correctly", async () => {
          oldtotalVotingWeight = await rewardsLocker.totalVotingWeight()

          await rewardsLocker.connect(user1).collectRewards(1);
          await rewardsLocker.connect(user3).collectRewards(0);

          newtotalVotingWeight = await rewardsLocker.totalVotingWeight();
          expect(oldtotalVotingWeight.sub(newtotalVotingWeight))
            .to.be.equal(BigNumber.from(3113).mul(BigNumber.from(10).pow(18)))
        });
      });
    });
    describe("Emergency KAP withdrawal", () => {
      beforeEach(async () => {
        amount = BigNumber.from(10).pow(await token.decimals());
        await token.transfer(rewardsLocker.address, amount);
      });
      it("should revert for zero to address", async () => {
        await expect(
          rewardsLocker
          .connect(governance)
          .transferKap(
            ethers.constants.AddressZero,
            await token.balanceOf(rewardsLocker.address)
          )
        ).to.be.revertedWith("ERC20: transfer to the zero address");
      });
      it("should revert for zero amount", async () => {
        await expect(
          rewardsLocker
          .connect(governance)
          .transferKap(
            governance.address,
            0
          )
        ).to.be.revertedWith("Invalid amount");
      });
      it("Should allow governance to transfer all KAP from Rewards Locker to governance", async () => {
        await rewardsLocker
          .connect(governance)
          .transferKap(
            governance.address,
            await token.balanceOf(rewardsLocker.address)
          );
        expect(await token.balanceOf(rewardsLocker.address)).to.equal(0);
        expect(await token.balanceOf(governance.address)).to.equal(amount);
      });
      it("Should allow teamMultisig to transfer all KAP from Rewards Locker to governance", async () => {
        await rewardsLocker
          .connect(teamMultisig)
          .transferKap(
            governance.address,
            await token.balanceOf(rewardsLocker.address)
          );
        expect(await token.balanceOf(rewardsLocker.address)).to.equal(0);
        expect(await token.balanceOf(governance.address)).to.equal(amount);
      });
      it("Should prohibit other addresses from transferring KAP out of Rewards Locker", async () => {
        await expect(
          rewardsLocker.connect(user1).transferKap(user1.address, 1)
        ).to.be.revertedWith("Access denied");
      });
    });
  });
});
