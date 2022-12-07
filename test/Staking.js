const { expect } = require("chai");
const { ethers } = require("hardhat");
const { getContractAddress } = require("@ethersproject/address");
const { BigNumber, utils } = require("ethers");
const { parseUnits, keccak256 } = require("ethers/lib/utils");

const days = 60 * 60 * 24;
const weeks = 7 * days;

const zeroAddress = ethers.constants.AddressZero;

const time = async () => {
    return (await ethers.provider.getBlock()).timestamp;
}
const skip = async (time) => {
    await ethers.provider.send("evm_increaseTime", [time]);
    await ethers.provider.send("evm_mine");
}

describe("Contract: Staking", () => {
    describe("Constructor", () => {
        let deployer, teamMultisig;
        let Staking;
        let staking, token, rewardsLocker, governanceRegistry;
        before(async () => {
            [deployer, teamMultisig, governance] = await ethers.getSigners();

            const Token = await ethers.getContractFactory("Token");
            token = await Token.deploy();
            const GovernanceTester = await ethers.getContractFactory("GovernanceTester");
            const governanceTester = await GovernanceTester.deploy();
            const GovernanceRegistry = await ethers.getContractFactory("GovernanceRegistry");
            governanceRegistry = await GovernanceRegistry.deploy(governanceTester.address)
            const RewardsLocker = await ethers.getContractFactory("RewardsLocker");

            const transactionCount = await deployer.getTransactionCount();
            expectedStakingAddress = getContractAddress({
                from: deployer.address,
                nonce: transactionCount + 1,
            });

            rewardsLocker = await RewardsLocker.deploy(
                expectedStakingAddress,
                governanceRegistry.address,
                token.address,
                teamMultisig.address
            );

            Staking = await ethers.getContractFactory("Staking");
            staking = await Staking.deploy(
                token.address,
                governanceRegistry.address,
                rewardsLocker.address,
                teamMultisig.address
            );

            expect(staking.address).to.equal(expectedStakingAddress);
        });
        it("Should deploy with correct constants", async () => {
            expect(await staking.MIN_LOCK()).to.equal(4 * weeks);
            expect(await staking.MAX_LOCK()).to.equal(52 * weeks);
            expect(await staking.CUMULATIVE_MULTIPLIER()).to.equal(1e12);
            
            expect(await staking.cumulative()).to.equal(0);
            expect(await staking.totalWeight()).to.equal(0);
            expect(await staking.syncdTo()).to.equal(0);
            expect(await staking.totalBoostRewards()).to.equal(0);
            expect(await staking.boostOn()).to.be.true;
            
            // expect().to.equal(4 * weeks);
            const emission = await staking.emission();
            expect(emission.rate).to.equal(0);
            expect(emission.expiration).to.equal(0);
        });
        it("Should deploy with correct params", async () => {
            const expectedTEAM_MULTISIG = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('TEAM_MULTISIG'));
            expect(await staking.TEAM_MULTISIG()).to.equal(expectedTEAM_MULTISIG);
            expect(await staking.asset()).to.equal(token.address);
            expect(await staking.governanceRegistry()).to.equal(governanceRegistry.address);
            expect(await staking.rewardsLocker()).to.equal(rewardsLocker.address);
        });
        it("Should revert if deployed with zero address params", async () => {
            await expect(
                Staking.deploy(zeroAddress, governanceRegistry.address, rewardsLocker.address, teamMultisig.address)
            ).to.be.revertedWith("Staking: Zero address");
            await expect(
                Staking.deploy(token.address, zeroAddress, rewardsLocker.address, teamMultisig.address)
            ).to.be.revertedWith("Staking: Zero address");
            await expect(
                Staking.deploy(token.address, governanceRegistry.address, zeroAddress, teamMultisig.address)
            ).to.be.revertedWith("Staking: Zero address");
            await expect(
                Staking.deploy(token.address, governanceRegistry.address, rewardsLocker.address, zeroAddress)
            ).to.be.revertedWith("Staking: Zero address");
        });
    });
    describe("Admin", () => {
        let deployer, teamMultisig;
        let Staking;
        let staking, token, rewardsLocker, governanceRegistry;
        before(async () => {
            [deployer, teamMultisig, governance] = await ethers.getSigners();

            const Token = await ethers.getContractFactory("Token");
            token = await Token.deploy();
            const GovernanceTester = await ethers.getContractFactory("GovernanceTester");
            const governanceTester = await GovernanceTester.deploy();
            const GovernanceRegistry = await ethers.getContractFactory("GovernanceRegistry");
            governanceRegistry = await GovernanceRegistry.deploy(governanceTester.address)
            const RewardsLocker = await ethers.getContractFactory("RewardsLocker");

            const transactionCount = await deployer.getTransactionCount();
            expectedStakingAddress = getContractAddress({
                from: deployer.address,
                nonce: transactionCount + 1,
            });

            rewardsLocker = await RewardsLocker.deploy(
                expectedStakingAddress,
                governanceRegistry.address,
                token.address,
                teamMultisig.address
            );

            Staking = await ethers.getContractFactory("Staking");
            staking = await Staking.deploy(
                token.address,
                governanceRegistry.address,
                rewardsLocker.address,
                teamMultisig.address
            );

            expect(staking.address).to.equal(expectedStakingAddress);

            await token.approve(staking.address, BigNumber.from(2).pow(110));
            await staking.stake(parseUnits('1'), 52*weeks);
        });
        describe("updateEmission", () => {
            it("Should revert if invalid expiration", async () => {
                await expect(staking.connect(teamMultisig).updateEmission(parseUnits('1'), 0))
                    .to.be.revertedWith("Staking: Invalid expiration");
            });
            it("Should revert if not admin", async () => {
                await expect(staking.updateEmission(parseUnits('1'), 52*weeks))
                    .to.be.revertedWith("Staking: Only admin");
            });
            it("Should allow admin to update Emission", async () => {
                await expect(staking.connect(teamMultisig).updateEmission(parseUnits('1'), (await time()) + 52*weeks))
                    .to.not.be.reverted;

                // After 4 weeks turn off emissions
                await skip(4 * weeks);
                await expect(staking.connect(teamMultisig).updateEmission(0, (await time()) + 52*weeks))
                    .to.not.be.reverted;
                expect(await staking.cumulative()).to.be.gt(0);
            });
        });
        describe("turnOffBoost", () => {
            it("Should revert if not admin", async () => {
                await expect(staking.turnOffBoost())
                    .to.be.revertedWith('Staking: Only admin');
            });
            it("Should set boostOn to false", async () => {
                expect(await staking.boostOn()).to.be.true;
                await expect(staking.connect(teamMultisig).turnOffBoost())
                    .to.not.be.reverted;
                expect(await staking.boostOn()).to.be.false;
            });
            it("Should revert if boostOn is already false", async () => {
                expect(await staking.boostOn()).to.be.false;
                await expect(staking.connect(teamMultisig).turnOffBoost())
                    .to.be.revertedWith('Staking: Already off');
            });
        });
    });
    describe("Transactions", () => {
        let deployer, teamMultisig;
        let staking, token, rewardsLocker, governanceRegistry;
        
        const getDepositsLength = async (staker) => {
            return await ethers.provider.getStorageAt(
                staking.address,
                keccak256(
                    utils.hexlify(utils.concat([
                        utils.zeroPad(utils.arrayify(staker.address), 32),
                        utils.zeroPad(utils.arrayify(8), 32)
                    ]))
                )
            )
        }
        before(async () => {
            [deployer, teamMultisig, governance, staker1, staker2, staker3] = await ethers.getSigners();

            const Token = await ethers.getContractFactory("Token");
            token = await Token.deploy();
            const GovernanceTester = await ethers.getContractFactory("GovernanceTester");
            const governanceTester = await GovernanceTester.deploy();
            const GovernanceRegistry = await ethers.getContractFactory("GovernanceRegistry");
            governanceRegistry = await GovernanceRegistry.deploy(governanceTester.address)
            const RewardsLocker = await ethers.getContractFactory("RewardsLocker");

            const transactionCount = await deployer.getTransactionCount();
            expectedStakingAddress = getContractAddress({
                from: deployer.address,
                nonce: transactionCount + 1,
            });

            rewardsLocker = await RewardsLocker.deploy(
                expectedStakingAddress,
                governanceRegistry.address,
                token.address,
                teamMultisig.address
            );

            const Staking = await ethers.getContractFactory("Staking");
            staking = await Staking.deploy(
                token.address,
                governanceRegistry.address,
                rewardsLocker.address,
                teamMultisig.address
            );

            expect(staking.address).to.equal(expectedStakingAddress);

            const amount = BigNumber.from(10).pow(27).div(4);
            await token.transfer(staker1.address, amount);
            await token.transfer(staker2.address, amount);
            await token.transfer(staker3.address, amount);
            await token.connect(staker1).approve(staking.address, BigNumber.from(2).pow(110));
            await token.connect(staker2).approve(staking.address, BigNumber.from(2).pow(110));
            await token.connect(staker3).approve(staking.address, BigNumber.from(2).pow(110));
        })
        describe("stake", () => {            
            // Creates the specified staking deposit and performs checks
            const safeStake = async (staker, amount, lock) => {
                const depositsLength = await getDepositsLength(staker);
                const totalWeight = await staking.totalWeight();
                const totalStaked = await staking.totalStaked(staker.address);

                await expect(
                    staking.connect(staker).stake(amount, lock)
                ).to.emit(staking, "Stake").withArgs(
                    staker.address,
                    depositsLength,
                    amount,
                    lock
                ).and.to.not.be.reverted;

                expect(await getDepositsLength(staker)).to.equal(BigNumber.from(depositsLength).add(1));
                expect(await staking.totalWeight()).to.equal(totalWeight.add(BigNumber.from(amount).mul(lock)));
                expect(await staking.totalStaked(staker.address)).to.equal(totalStaked.add(amount));
                expect(await staking.lastStaked(staker.address)).to.equal(await time());

                return true;
            }
            it("Should revert if invalid amount", async () => {
                await expect(staking.stake(0, 0)).to.be.revertedWith("Staking: Zero amount");
                await expect(staking.stake(BigNumber.from(2).pow(112), 4 * weeks)).to.be.revertedWith("Staking: Overflow");
                await expect(staking.stake(BigNumber.from(2).pow(224), 4 * weeks)).to.be.revertedWith("Staking: Overflow");
            });
            it("Should revert if invalid lock period", async () => {
                await expect(staking.stake(1, 0)).to.be.revertedWith("Staking: Lock");
                await expect(staking.stake(1, 1 * weeks)).to.be.revertedWith("Staking: Lock");
                await expect(staking.stake(1, 53 * weeks)).to.be.revertedWith("Staking: Lock");
                await expect(staking.stake(1, 100 * weeks)).to.be.revertedWith("Staking: Lock");
            });
            it("Should revert if invalid param types", async () => {
                await expect(staking.stake(true, 4 * weeks)).to.be.reverted;
                await expect(staking.stake("hello world", 4 * weeks)).to.be.reverted;
                await expect(staking.stake([], 4 * weeks)).to.be.reverted;
            });
            it("Should revert if insufficient allowance", async () => {
                await expect(
                    staking.stake(1, 4 * weeks)
                ).to.be.revertedWith("ERC20: insufficient allowance");
            });
            it("Should revert if insufficient balance", async () => {
                await token.approve(staking.address, BigNumber.from(2).pow(110));
                await expect(
                    staking.stake(BigNumber.from(2).pow(110), 4 * weeks)
                ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
            });
            it("Should successfully create a staking Deposit", async () => {
                const [amount, lock] = [parseUnits('1'), 4 * weeks];
                expect(await safeStake(deployer, amount, lock)).to.be.true;
            });
            it("Should successfully create multiple staking Deposits", async () => {
                const [amount, lock] = [parseUnits('1'), 52 * weeks];
                for (i=0; i<3; ++i) {
                    await expect(safeStake(deployer, amount, lock)).to.not.be.reverted;
                }
            });
            it("Should successfully create staking Deposits for multiple users", async () => {
                const [amount, lock] = [parseUnits('2'), 52 * weeks];
                const stakers = [staker1, staker2, staker3];
                for (const staker of stakers) {await safeStake(staker, amount, lock)}
            });
        });
        describe("claimRewards", () => {
            beforeEach(async () => {
                // await staking.connect(teamMultisig).updateEmission(parseUnits('1'), (await time()) + 52*weeks);
                await staking.stake(parseUnits('1'), 52*weeks);
            });
            const calcRewards = async (deposit, extension) => {
                const cumulative = await staking.cumulative();
                const cumulativeDiff = cumulative.sub(deposit.cumulative);
                const lock = deposit.end.sub(deposit.start);
                const weight = deposit.amount.mul(lock);
                let rewards = weight.mul(cumulativeDiff).div(10**12);

                if (extension > 0) {
                    rewards = rewards.add(calcBoostRewards(rewards, deposit.end.sub(await time()), extension, lock));
                }

                return rewards;
            }
            const calcBoostRewards = (rewards, remaining, extension, lock) => {
                const maxExtension = BigNumber.from(52*weeks).sub(remaining);
                boostRewards = rewards.mul(remaining).mul(extension).div(lock.mul(maxExtension));
                return boostRewards;
            }
            const safeClaimRewards = async (staker, depositId, extension) => {
                const deposit = (await staking.getDeposits(staker.address))[depositId];
                const oldLockAgreements = await rewardsLocker.getLockAgreements(staker.address);
                
                await staking.connect(staker).claimRewards(depositId, extension);

                const expectedRewards = await calcRewards(deposit, extension);

                const lockAgreements = await rewardsLocker.getLockAgreements(staker.address);
                expect(lockAgreements.length).to.be.gt(oldLockAgreements.length);
                const lastLockAgreement = lockAgreements[lockAgreements.length-1];
                expect(lastLockAgreement.amount).to.equal(expectedRewards);
            }
            it("Should not create lock agreement if no rewards", async () => {
                const depositId = await getDepositsLength(deployer) - 1;
                const oldLockAgreements = await rewardsLocker.getLockAgreements(deployer.address);
                await skip(4 * weeks);
                
                await expect(staking.claimRewards(depositId, 0))
                    .to.not.be.reverted;

                const lockAgreements = await rewardsLocker.getLockAgreements(deployer.address);
                expect(oldLockAgreements.length).to.equal(lockAgreements.length);
            });
            it("Should successfully claim with no boost", async () => {
                await staking.connect(teamMultisig).updateEmission(parseUnits('1'), (await time()) + 52*weeks);
                const depositId = await getDepositsLength(deployer) - 1;
                await skip(4 * weeks);
                await safeClaimRewards(deployer, depositId, 0);
            });
            it("Should successfully claim with boost", async () => {
                await staking.connect(teamMultisig).updateEmission(parseUnits('1'), (await time()) + 52*weeks);
                const depositId = await getDepositsLength(deployer) - 1;
                await skip(10 * weeks);
                await safeClaimRewards(deployer, depositId, 10 * weeks);
            });
            it("Should revert if boosting past lock end", async () => {
                await staking.connect(teamMultisig).updateEmission(parseUnits('1'), (await time()) + 52*weeks);
                const depositId = await getDepositsLength(deployer) - 1;
                await skip(52 * weeks + 1);
                await expect(staking.claimRewards(depositId, 10 * weeks))
                    .to.be.revertedWith('Staking: Remaining');
            });
            it("Should revert if invalid boost new lock", async () => {
                await staking.connect(teamMultisig).updateEmission(parseUnits('1'), (await time()) + 52*weeks);
                const depositId = await getDepositsLength(deployer) - 1;
                await skip(51 * weeks);
                await expect(staking.claimRewards(depositId, 1 * weeks))
                    .to.be.revertedWith('Staking: New lock');
            });
            it("Should revert if collected already", async () => {
                await staking.connect(teamMultisig).updateEmission(parseUnits('1'), (await time()) + 52*weeks);
                await skip(52 * weeks)
                const depositId = await getDepositsLength(deployer) - 1;
                await staking.unstake(depositId)
                await skip(2 * weeks)
                await expect(staking.claimRewards(depositId, 1 * weeks))
                    .to.be.revertedWith('Staking: Already collected');
            });
            it("Should not boost if turned off", async () => {
                await staking.connect(teamMultisig).updateEmission(parseUnits('1'), (await time()) + 52*weeks);
                await staking.connect(teamMultisig).turnOffBoost();
                expect(await staking.boostOn()).to.be.false
                const depositId = await getDepositsLength(deployer) - 1;
                const deposit = (await staking.getDeposits(deployer.address))[depositId];
                await staking.claimRewards(depositId, 5 * weeks);

                const depositNew = (await staking.getDeposits(deployer.address))[depositId];
                expect(deposit.start).to.equal(depositNew.start)
                expect(deposit.end).to.equal(depositNew.end)
                const expectedRewards = await calcRewards(deposit, 0);  // rewards with no extension
                const lockAgreements = await rewardsLocker.getLockAgreements(deployer.address);
                const lastLockAgreement = lockAgreements[lockAgreements.length-1];
                expect(lastLockAgreement.amount).to.equal(expectedRewards);
            });
        });
        describe("unstake", () => {
            beforeEach(async () => {
                await staking.stake(parseUnits('2'), 52*weeks);
            });
            const calcRewards = async (deposit, extension) => {
                const cumulative = await staking.cumulative();
                const cumulativeDiff = cumulative.sub(deposit.cumulative);
                const lock = deposit.end.sub(deposit.start);
                const weight = deposit.amount.mul(lock);
                let rewards = weight.mul(cumulativeDiff).div(10**12);

                if (extension > 0) {
                    rewards = rewards.add(calcBoostRewards(rewards, deposit.end.sub(await time()), extension, lock));
                }

                return rewards;
            }
            const calcBoostRewards = (rewards, remaining, extension, lock) => {
                const maxExtension = BigNumber.from(52*weeks).sub(remaining);
                boostRewards = rewards.mul(remaining).mul(extension).div(lock.mul(maxExtension));
                return boostRewards;
            }
            it("Should revert if not yet unlocked", async () => {
                await skip(52 * weeks - 10);
                const depositId = await getDepositsLength(deployer) - 1;
                await expect(staking.unstake(depositId))
                    .to.be.revertedWith('Staking: Early unstake')
                await skip(10)
                await expect(staking.unstake(depositId))
                    .not.to.be.reverted
            });
            it("Should revert if already collected", async () => {
                await staking.connect(teamMultisig).updateEmission(parseUnits('1'), (await time()) + 52 * weeks);
                const depositId = await getDepositsLength(deployer) - 1;
                await skip(52 * weeks);
                await staking.unstake(depositId)

                await skip(2 * weeks);
                await expect(staking.unstake(depositId))
                    .to.be.revertedWith('Staking: Already collected');
            });
            it("Should not create lock agreement if no rewards", async () => {
                await staking.connect(teamMultisig).updateEmission(parseUnits('1'), (await time()) + 40 * weeks);
                await skip(41 * weeks);

                // rewards already stopped
                const depositId = await getDepositsLength(deployer) - 1;
                await staking.claimRewards(depositId, 0);
                await skip(11 * weeks);
                const oldLockAgreements = await rewardsLocker.getLockAgreements(deployer.address);
                await expect(staking.unstake(depositId))
                    .to.not.be.reverted;
                const lockAgreements = await rewardsLocker.getLockAgreements(deployer.address);
                expect(oldLockAgreements.length).to.equal(lockAgreements.length);
            });
            it("Should successfully withdraw asset with claiming rewards", async () => {
                await staking.connect(teamMultisig).updateEmission(parseUnits('1'), (await time()) + 52 * weeks);
                await skip(52 * weeks);

                const oldLockAgreements = await rewardsLocker.getLockAgreements(deployer.address);
                const depositId = await getDepositsLength(deployer) - 1;
                const oldDeposit = (await staking.getDeposits(deployer.address))[depositId]
                await expect(staking.unstake(depositId))
                    .to.emit(staking, "Unstake").withArgs(
                        deployer.address,
                        depositId,
                        parseUnits('2')
                    )

                const deposit = (await staking.getDeposits(deployer.address))[depositId]
                expect(deposit.collected).to.be.true

                const expectedRewards = await calcRewards(oldDeposit, 0);
                const lockAgreements = await rewardsLocker.getLockAgreements(deployer.address);
                expect(lockAgreements.length).to.equal(oldLockAgreements.length + 1);
                const lastLockAgreement = lockAgreements[lockAgreements.length-1];
                expect(lastLockAgreement.amount).to.equal(expectedRewards);
            });

        });
    });
    describe("Queries", () => {
        let deployer, teamMultisig;
        let staking, token, rewardsLocker, governanceRegistry;

        before(async () => {
            [deployer, teamMultisig, governance] = await ethers.getSigners();

            const Token = await ethers.getContractFactory("Token");
            token = await Token.deploy();
            const GovernanceTester = await ethers.getContractFactory("GovernanceTester");
            const governanceTester = await GovernanceTester.deploy();
            const GovernanceRegistry = await ethers.getContractFactory("GovernanceRegistry");
            governanceRegistry = await GovernanceRegistry.deploy(governanceTester.address)
            const RewardsLocker = await ethers.getContractFactory("RewardsLocker");

            const transactionCount = await deployer.getTransactionCount();
            expectedStakingAddress = getContractAddress({
                from: deployer.address,
                nonce: transactionCount + 1,
            });

            rewardsLocker = await RewardsLocker.deploy(
                expectedStakingAddress,
                governanceRegistry.address,
                token.address,
                teamMultisig.address
            );

            const Staking = await ethers.getContractFactory("Staking");
            staking = await Staking.deploy(
                token.address,
                governanceRegistry.address,
                rewardsLocker.address,
                teamMultisig.address
            );

            expect(staking.address).to.equal(expectedStakingAddress);

            await token.approve(staking.address, BigNumber.from(2).pow(110));
        })
        describe("votingWeight", () => {
            it("Should return correct amount", async () => {
                await staking.stake(parseUnits('2'), 52*weeks);
                expect(await staking.votingWeight(deployer.address)).to.equal(0)
                await skip(3 * days - 10);
                expect(await staking.votingWeight(deployer.address)).to.equal(0)
                await skip(11);
                expect(await staking.votingWeight(deployer.address)).to.equal(parseUnits('2'))

                await staking.stake(parseUnits('5'), 52*weeks);
                await skip(3 * days - 10);
                expect(await staking.votingWeight(deployer.address)).to.equal(0)
                await skip(11);
                expect(await staking.votingWeight(deployer.address)).to.equal(parseUnits('7'))
            })
        });
        describe("getDeposits", () => {
            it("Should return valid records", async () => {
                await staking.connect(teamMultisig).updateEmission(parseUnits('1'), (await time()) + 52*weeks);

                let deposits = await staking.getDeposits(deployer.address)
                expect(deposits.length).to.equal(2)

                for (let i = 1; i <= 5; i ++) {
                    await staking.stake(parseUnits(`${i}`), 52 * weeks)

                    const cumulative = await staking.cumulative();

                    deposits = await staking.getDeposits(deployer.address)
                    expect(deposits.length).to.equal(2 + i)
                    expect(deposits[deposits.length - 1].amount).equal(parseUnits(`${i}`))
                    expect(deposits[deposits.length - 1].collected).equal(false)
                    expect(deposits[deposits.length - 1].start).equal(await time())
                    expect(deposits[deposits.length - 1].end).equal((await time()) + 52 * weeks)
                    expect(deposits[deposits.length - 1].cumulative).equal(cumulative)
                }
            })
        });
    });
});