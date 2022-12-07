const { expect } = require("chai");
const { BigNumber, utils } = require("ethers");
const { parseEther, keccak256 } = require("ethers/lib/utils");
const { ethers } = require("hardhat");

const days = 60 * 60 * 24;
const zeroAddress = ethers.constants.AddressZero;

describe("Contract: Governance", () => {
    describe("Constructor", () => {
        let deployer, teamMultisig;
        let Governance, governance;
        let vestingSource;

        before(async () => {
            [deployer, teamMultisig] = await ethers.getSigners();

            Governance = await ethers.getContractFactory("Governance");
            const VotingWeightSourceTester = await ethers.getContractFactory("VotingWeightSourceTester");

            vestingSource = await VotingWeightSourceTester.deploy(parseEther('1'));
            governance = await Governance.deploy(
                vestingSource.address,
                teamMultisig.address
            );
        });
        it("Should deploy with correct constants", async () => {
            expect(await governance.START_VOTE()).to.equal(3 * days);
            expect(await governance.END_VOTE()).to.equal(6 * days);
            expect(await governance.EXECUTE()).to.equal(9 * days);
            expect(await governance.EXPIRE()).to.equal(12 * days);
            expect(await governance.PROPOSE_COOLDOWN()).to.equal(3 * days);
            expect(await governance.QUORUM()).to.equal(BigNumber.from(10).pow(27).mul(4).div(100));
            expect(await governance.THRESHOLD()).to.equal(BigNumber.from(10).pow(27).mul(65).div(10000));
            expect(await governance.VETOER()).to.equal(keccak256(utils.toUtf8Bytes('VETOER')));
        });
        it("Should deploy with correct params and roles", async () => {
            expect(await governance.vesting()).to.equal(vestingSource.address);
            expect(await governance.hasRole(await governance.VETOER(), teamMultisig.address)).to.be.true;
            
            // Should not have VETOER role
            expect(await governance.hasRole(await governance.VETOER(), deployer.address)).to.be.false;
        });
        it("Should not deploy with invalid params", async () => {
            // Zero address
            await expect(Governance.deploy(zeroAddress, teamMultisig.address))
                .to.be.revertedWith('Governance: Zero address');
            await expect(Governance.deploy(vestingSource.address, zeroAddress))
                .to.be.revertedWith('Governance: Zero address');

            // Non address
            await expect(Governance.deploy(0, teamMultisig.address))
                .to.be.reverted;
            await expect(Governance.deploy('hello world', teamMultisig.address))
                .to.be.reverted;
            await expect(Governance.deploy(true, teamMultisig.address))
                .to.be.reverted;

            // Missing params
            await expect(Governance.deploy(teamMultisig.address))
                .to.be.reverted;
        });
    });
    describe("Transactions", () => {
        let deployer, teamMultisig;
        let Governance, governance;
        let vestingSource;

        const skip = async (time) => {
            await ethers.provider.send("evm_increaseTime", [time]);
            await ethers.provider.send("evm_mine");
        }
        const getProposalsLength = async () => {
            return await ethers.provider.getStorageAt(
                governance.address,
                2
            );
        }
        before(async () => {
            [deployer, teamMultisig, user, user2] = await ethers.getSigners();

            Governance = await ethers.getContractFactory("Governance");
            const VotingWeightSourceTester = await ethers.getContractFactory("VotingWeightSourceTester");

            vestingSource = await VotingWeightSourceTester.deploy(parseEther('1'));
            governance = await Governance.deploy(
                vestingSource.address,
                teamMultisig.address
            );
        });
        describe("propose", () => {
            beforeEach(async () => {
                // Set vesting to 1%
                await vestingSource.setVal(parseEther('10000000'));
            });
            beforeEach(async () => {
                // Skip 3 days to avoid proposeCooldown
                await skip(3 * days);
            });
            it("Should create a valid proposal", async () => {
                const latestProposalId = await getProposalsLength();
                let targets = [zeroAddress];
                let values = ['0x0'];
                let data = [[]];
                await expect(governance.propose(targets, values, data)).to.not.be.reverted;
                
                const time = (await (ethers.provider.getBlock())).timestamp;
                expect(await governance.lastProposal(deployer.address)).to.equal(time);
                const proposal = await governance.proposals(latestProposalId);
                const encodedParams = ethers.utils.defaultAbiCoder.encode(
                    ['address[]', 'uint256[]', 'bytes[]'], [targets, values, data]
                );
                expect(proposal.paramsHash).to.equal(keccak256(encodedParams));
                expect(proposal.time).to.equal(time);
                expect(proposal.yays).to.equal(0);
                expect(proposal.nays).to.equal(0);
                expect(proposal.executed).to.be.false;
                expect(proposal.vetoed).to.be.false;
            });
            it("Should revert insufficient voting weight", async () => {
                let targets = [zeroAddress];
                let values = ['0x0'];
                let data = [[]];

                // 0.649% of KAP total supply
                await vestingSource.setVal(parseEther('6499999'));
                await expect(
                    governance.propose(targets, values, data)
                ).to.be.revertedWith("Governance: Threshold")
            });
            it("Should revert spam proposals", async () => {
                let targets = [zeroAddress];
                let values = ['0x0'];
                let data = [[]];

                // 0.65% of KAP total supply
                await vestingSource.setVal(parseEther('6500000'));
                // 1st proposal
                await governance.propose(targets, values, data)

                // 60 seconds before cooldown expired
                await skip(3 * days - 60)
                await expect(
                    governance.propose(targets, values, data)
                ).to.be.revertedWith("Governance: Propose cooldown")

                await skip(60)
                await expect(
                    governance.propose(targets, values, data)
                ).to.not.be.reverted
            });
            it("Should revert invalid params", async () => {
                let targets = [zeroAddress];
                let values = ['0x0'];
                let data = [[]];
                await expect(
                    governance.propose([], values, data)
                ).to.be.revertedWith("Governance: Invalid targets")
                await expect(
                    governance.propose(targets, [], data)
                ).to.be.revertedWith("Governance: Invalid values")
                await expect(
                    governance.propose(targets, [...values, '0x01'], data)
                ).to.be.revertedWith("Governance: Invalid values")
                await expect(
                    governance.propose(targets, values, [])
                ).to.be.revertedWith("Governance: Invalid data")
                await expect(
                    governance.propose(targets, values, [...data, []])
                ).to.be.revertedWith("Governance: Invalid data")
            });
        });
        describe("vote", () => {
            let activeProposalID, secondProposalID
            before(async () => {
                // Set vesting to 1%
                await vestingSource.setVal(parseEther('10000000'));

                activeProposalID = await getProposalsLength();
                await governance.propose(
                    [ethers.constants.AddressZero],
                    ['0x0'],
                    [[]]
                )
                // vetoed
                secondProposalID = await getProposalsLength();
                await governance.connect(user).propose(
                    [ethers.constants.AddressZero],
                    ['0x0'],
                    [[]]
                )
            })
            it("Should revert if invalid proposal", async () => {
                await expect(
                    governance.vote(
                        BigNumber.from(activeProposalID).add(2),
                        true
                    )
                ).to.be.revertedWith("Governance: Invalid id")
            })
            it("Should revert if before start voting window", async () => {
                await skip(3 * days - 10)
                await expect(
                    governance.vote(activeProposalID, true)
                ).to.be.revertedWith("Governance: Voting window")
            })
            it("Should revert if voting with zero weight", async () => {
                await skip(10)

                await vestingSource.setVal(parseEther('0'));
                await expect(
                    governance.vote(activeProposalID, true)
                ).to.be.revertedWith("Governance: Zero weight")
            })
            it("Should successfully update vote counter", async () => {
                await vestingSource.setVal(parseEther('1'));
                await expect(
                    governance.vote(activeProposalID, true)
                ).to.not.be.reverted;
                let proposal = await governance.proposals(activeProposalID);
                expect(proposal.yays).to.equal(parseEther('1'));
                expect(proposal.nays).to.equal(0);

                await expect(
                    governance.connect(user).vote(activeProposalID, false)
                ).to.not.be.reverted;
                proposal = await governance.proposals(activeProposalID);
                expect(proposal.yays).to.equal(parseEther('1'));
                expect(proposal.nays).to.equal(parseEther('1'));
            })
            it("Should revert if invalid voting weight", async () => {
                // 100000% of totalSupply, > 2^96
                await vestingSource.setVal(parseEther('1000000000000'));
                await expect(
                    governance.connect(user2).vote(activeProposalID,  true)
                ).to.be.revertedWith("Governance: Overflow");
            })
            it("Should revert if already voted", async () => {
                await expect(
                    governance.vote(activeProposalID, false)
                ).to.be.revertedWith("Governance: Already voted");
            })
            it("Should revert if after end voting window", async () => {
                await skip(3 * days)
                await expect(
                    governance.connect(user2).vote(activeProposalID,  false)
                ).to.be.revertedWith("Governance: Voting window")
            })
        });
        describe("execute", () => {
            let targets, values, data;
            let targetsEth, valuesEth, dataEth;
            let callTester;
            before(async () => {
                const CallTester = await ethers.getContractFactory("CallTester");
                callTester = await CallTester.deploy();

                targets = [callTester.address];
                values = ['0x0'];
                data = [CallTester.interface.encodeFunctionData('testCall', [123])];

                targetsEth = [callTester.address];
                valuesEth = ['0x1'];
                dataEth = [CallTester.interface.encodeFunctionData('testCallEther', [])];
            })
            it("Should revert if invalid proposal", async () => {
                const latestProposalId = await getProposalsLength();
                await expect(
                    governance.execute(latestProposalId, targets, values, data)
                ).to.be.revertedWith('Governance: Invalid id');
            })
            it("Should revert if params hash does not match", async () => {
                const latestProposalId = await getProposalsLength();
                await skip(3 * days);
                await governance.propose(targets, values, data);
                await skip(9 * days);
                await expect(
                    governance.execute(latestProposalId, targets, valuesEth, data)
                ).to.be.revertedWith('Governance: Transact params');
            })
            it("Should revert if yays <= nays", async () => {
                const latestProposalId = await getProposalsLength();
                await skip(3 * days);
                await governance.propose(targets, values, data);
                // Vote against, 1% of totalSupply
                await vestingSource.setVal(parseEther('10000000'));
                await skip(3 * days);
                await governance.vote(latestProposalId, false);

                await skip(3 * days);
                await expect(
                    governance.execute(latestProposalId, targets, values, data)
                ).to.be.revertedWith('Governance: Unsuccessful');
            })
            it("Should revert if before start executing window", async () => {
                const latestProposalId = await getProposalsLength();
                await skip(3 * days);
                await governance.propose(targets, values, data);
                // Vote For
                await skip(3 * days);
                await governance.vote(latestProposalId, true);

                await expect(governance.execute(latestProposalId, targets, values, data))
                    .to.be.revertedWith('Governance: Execution window');
            })
            it("Should revert if yays + nays < quorum", async () => {
                const latestProposalId = await getProposalsLength();
                await skip(3 * days);
                await governance.propose(targets, values, data);
                // Vote For
                await skip(3 * days);
                await vestingSource.setVal(parseEther('39999999'));
                await governance.vote(latestProposalId, true);

                await skip(6 * days);
                await expect(governance.execute(latestProposalId, targets, values, data))
                    .to.be.revertedWith('Governance: Quorum');
            })
            it("Should revert if balance insufficient", async () => {
                const latestProposalId = await getProposalsLength();
                await skip(3 * days);
                await governance.propose(targetsEth, valuesEth, dataEth);
                // Vote For, 4% of totalSupply
                await vestingSource.setVal(parseEther('40000000'));
                await skip(3 * days);
                await governance.vote(latestProposalId, true);

                await skip(6 * days);
                await expect(governance.execute(latestProposalId, targetsEth, valuesEth, dataEth, {value: 0}))
                    .to.be.reverted;
            })
            it("Should successfully send ETH", async () => {
                let latestProposalId = await getProposalsLength();
                await skip(3 * days);
                await governance.propose(targetsEth, valuesEth, dataEth);
                // Vote For, 4% of totalSupply
                await vestingSource.setVal(parseEther('40000000'));
                await skip(3 * days);
                await governance.vote(latestProposalId, true);

                await skip(6 * days);
                expect(await callTester.getBal()).to.equal(0);
                await expect(governance.execute(latestProposalId, targetsEth, valuesEth, dataEth, {value: 1}))
                    .to.not.be.reverted;
                expect(await callTester.getBal()).to.equal(1);

                expect(await ethers.provider.getBalance(governance.address)).to.equal(0)

                // deposit ETH directly to contract, and execute with 0 value
                await user.sendTransaction({
                    to: governance.address,
                    value: ethers.utils.parseUnits('1', "wei")
                })
                await skip(3 * days);
                latestProposalId = await getProposalsLength();
                await governance.propose(targetsEth, valuesEth, dataEth);
                await skip(3 * days);
                await governance.vote(latestProposalId, true);
                await skip(6 * days);
                await expect(governance.execute(latestProposalId, targetsEth, valuesEth, dataEth, {value: 0}))
                    .to.not.be.reverted;

                expect(await callTester.getBal()).to.equal(2);
                expect(await ethers.provider.getBalance(governance.address)).to.equal(0)
            })
            it("Should successfully execute target contract", async () => {
                const latestProposalId = await getProposalsLength();
                await skip(3 * days);
                await governance.propose(targets, values, data);
                // Vote For, 4% of totalSupply
                await vestingSource.setVal(parseEther('40000000'));
                await skip(3 * days);
                await governance.vote(latestProposalId, true);

                await skip(6 * days);
                await expect(governance.execute(latestProposalId, targets, values, data))
                    .to.not.be.reverted;

                // verify execution result
                expect(await callTester.execResult()).to.equal(123)
            })
            it("Should revert if already executed", async () => {
                const latestProposalId = await getProposalsLength() - 1;

                await expect(governance.execute(latestProposalId, targets, values, data))
                    .to.be.revertedWith('Governance: Already executed');
            })
            it("Should revert if after expired executing window", async () => {
                const latestProposalId = await getProposalsLength();
                await skip(3 * days);
                await governance.propose(targets, values, data);
                // Vote For, 4% of totalSupply
                await vestingSource.setVal(parseEther('40000000'));
                await skip(3 * days);
                await governance.vote(latestProposalId, true);

                await skip(9 * days);
                await expect(governance.execute(latestProposalId, targets, values, data))
                    .to.be.revertedWith('Governance: Execution window');
            })
        });
        describe("veto", () => {
            let targets, values, data;
            before(async () => {
                targets = [zeroAddress];
                values = ['0x0'];
                data = [[]];
            })
            it("Should revert if invalid Id", async () => {
                const latestProposalId = await getProposalsLength();
                
                await expect(
                    governance.connect(teamMultisig).veto(latestProposalId)
                ).to.be.revertedWith('Governance: Invalid id');
            })
            it("Should revert if already executed", async () => {
                const latestProposalId = await getProposalsLength();
                await skip(3 * days);
                await governance.propose(targets, values, data);
                // Vote For, 4% of totalSupply
                await vestingSource.setVal(parseEther('40000000'));
                await skip(3 * days);
                await governance.vote(latestProposalId, true);

                await skip(6 * days);
                await expect(governance.execute(latestProposalId, targets, values, data))
                    .to.not.be.reverted;

                await expect(
                    governance.connect(teamMultisig).veto(latestProposalId)
                ).to.be.revertedWith('Governance: Already executed');
            })
            it("Should successfully veto a proposal", async () => {
                const latestProposalId = await getProposalsLength();
                await skip(3 * days);
                await governance.propose(targets, values, data);

                await governance.connect(teamMultisig).veto(latestProposalId);

                const proposal = await governance.proposals(latestProposalId);
                expect(proposal.vetoed).to.be.true;
            })
            it("Should revert if already vetoed", async () => {
                const latestProposalId = await getProposalsLength();
                await skip(3 * days);
                await governance.propose(targets, values, data);

                await governance.connect(teamMultisig).veto(latestProposalId);

                await expect(
                    governance.connect(teamMultisig).veto(latestProposalId)
                ).to.be.revertedWith('Governance: Already vetoed');
            })
            it("Should revert voting if proposal vetoed", async () => {
                const latestProposalId = await getProposalsLength();
                await skip(3 * days);
                await governance.propose(targets, values, data);

                await governance.connect(teamMultisig).veto(latestProposalId);
                
                await skip(3 * days);
                await expect(
                    governance.vote(latestProposalId, false)
                ).to.be.revertedWith("Governance: Vetoed");
            })
            it("Should revert execution if proposal vetoed", async () => {
                const latestProposalId = await getProposalsLength();
                await skip(3 * days);
                await governance.propose(targets, values, data);
                // Vote For, 4% of totalSupply
                await vestingSource.setVal(parseEther('40000000'));
                await skip(3 * days);
                await governance.vote(latestProposalId, true);
                
                await governance.connect(teamMultisig).veto(latestProposalId);

                await skip(6 * days);
                await expect(governance.execute(latestProposalId, targets, values, data))
                    .to.be.revertedWith("Governance: Vetoed");
            })
        });
    });
    describe("Queries", () => {
        let deployer, teamMultisig;
        let Governance, governance;
        let vestingSource;

        const skip = async (time) => {
            await ethers.provider.send("evm_increaseTime", [time]);
            await ethers.provider.send("evm_mine");
        }
        before(async () => {
            [deployer, teamMultisig] = await ethers.getSigners();

            Governance = await ethers.getContractFactory("Governance");
            const VotingWeightSourceTester = await ethers.getContractFactory("VotingWeightSourceTester");

            vestingSource = await VotingWeightSourceTester.deploy(parseEther('1'));
            governance = await Governance.deploy(
                vestingSource.address,
                teamMultisig.address
            );
        });
        describe("votingPeriod", () => {
            it("Should report the correct votingPeriod", async () => {
                expect(await governance.votingPeriod()).to.equal(3 * days);
            });
        });
        describe("getProposals", () => {
            it("Should return no proposals at first", async () => {
                expect((await governance.getProposals()).length).to.equal(0);
            })
            it("Should return all proposals", async () => {
                let proposal;
                const targets = [ethers.constants.AddressZero];
                const values = ['0x0'];
                const data = [[]];
                const encodedParams = ethers.utils.defaultAbiCoder.encode(
                    ['address[]', 'uint256[]', 'bytes[]'], [targets, values, data]
                );
                const hashedParams = keccak256(encodedParams);
                const verifyProposals = (_proposals) => {
                    const proposalsLength = _proposals.length;
                    for (i=0; i<proposalsLength; ++i) {
                        const proposal = _proposals[i];
                        expect(proposal.paramsHash).to.equal(hashedParams);
                        expect(proposal.yays).to.equal(0);
                        expect(proposal.nays).to.equal(0);
                        expect(proposal.executed).to.be.false;
                        expect(proposal.vetoed).to.be.false;
                    }
                }

                // Set vesting to 1%
                await vestingSource.setVal(parseEther('10000000'));

                // 1 proposal
                await governance.propose(
                    [ethers.constants.AddressZero],
                    ['0x0'],
                    [[]]
                )
                proposals = await governance.getProposals();
                expect(proposals.length).to.equal(1);
                verifyProposals(proposals);

                // 20 proposals
                for (let i = 1; i < 20; i++) {
                    await skip(3 * days);
                    await governance.propose(
                        [ethers.constants.AddressZero],
                        ['0x0'],
                        [[]]
                    )
                }
                proposals = await governance.getProposals();
                expect(proposals.length).to.equal(20);
                verifyProposals(proposals);
            })
        });
    });
    describe("Edge cases", () => {
        let deployer, teamMultisig;
        let Governance, governance;
        let vestingSource;        
        let targets, values, data;

        const skip = async (time) => {
            await ethers.provider.send("evm_increaseTime", [time]);
            await ethers.provider.send("evm_mine");
        }
        before(async () => {
            [deployer, teamMultisig] = await ethers.getSigners();

            Governance = await ethers.getContractFactory("Governance");
            const VotingWeightSourceTester = await ethers.getContractFactory("VotingWeightSourceTester");

            vestingSource = await VotingWeightSourceTester.deploy(parseEther('1'));
            governance = await Governance.deploy(
                vestingSource.address,
                teamMultisig.address
            );

            targets = [zeroAddress];
            values = ['0x0'];
            data = [[]];
        });
        it("Should revert if timestamp uint96 overflow", async () => {
            const skipTime = Number.MAX_SAFE_INTEGER;
            for (i=0; i<8; ++i) {
                await skip(skipTime);
            }
            // 1% of totalSupply
            await vestingSource.setVal(parseEther('10000000'));
            await expect(
                governance.propose(targets, values, data)
            ).to.be.revertedWith('Governance: Overflow');
        });
    });
    after(async () => {
        await ethers.provider.send('hardhat_reset');
    })
});
