const { expect } = require("chai");
const { loadFixture } = require("ethereum-waffle");
const { BigNumber, utils } = require("ethers");
const { parseEther, keccak256 } = require("ethers/lib/utils");
const { ethers, network } = require("hardhat");
require("dotenv").config();

const days = 60 * 60 * 24;
const zeroAddress = ethers.constants.AddressZero;
// Mainnet deployment
const wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const kapTokenAddress = "0x9625ce7753ace1fa1865a47aae2c5c2ce4418569";
const lpTokenAddress = "0x48200057593487b93311B03C845AFdA306a90e2a";
const routerAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const kapIsToken0 = true;
const governanceRegistryAddress = "0x02242A0A909F97bE3D727ab189f19B1961D76BE2";
const vestingAddress = "0xF4ff2F51d721Cc62201D81dab4B5EEcB3d692a99";
const stakingAddress = "0xCcDE05524864009A3976ACacd32F6728f08A7B4a";
const foundationMultiSigAddress = "0xbc450C9EcED158c6bD1AFfA8D37153E278e63e68";
// Mainnet vesters
const bigVesterAddress = "0x4ad5ef2698e03e74d49a42ddf7dad337db5712c9";
const smallVesterAddress = "0x177de5a0818f5a33935baef2778f37d02d97e4fe";
// Mainnet staker
const stakerAddress = "0xC25e850F6cedE52809014d4eeCCA402eb47bDC28";
// Mainnet token holder
const holderAddress = "0xE32aF0cEaF2BFB9469B811632914701A389f3da0";

describe("Contract: GovernanceV2 (Mainnet fork required)", () => {
  let deployer, whale, krill;
  let GovernanceV2, GovernanceRegistry, TimeLock;
  let governanceRegistry, kapVesting, staking;

  const resetFork = async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "https://mainnet.infura.io/v3/" + process.env.INFURA_ID,
            blockNumber: 15926090,
          },
        },
      ],
    });
  };

  const skip = async (time) => {
    await ethers.provider.send("evm_increaseTime", [time]);
    await ethers.provider.send("evm_mine");
  };

  const getProposalsLength = async (_governanceV2) => {
    return await ethers.provider.getStorageAt(_governanceV2.address, 2);
  };

  const now = async () => {
    return (await ethers.provider.getBlock()).timestamp;
  };

  const deployContractsFixture = async () => {
    // Fork mainnet for live tests
    await resetFork();

    const foundationMultiSig = await ethers.getImpersonatedSigner(
      foundationMultiSigAddress
    );
    await deployer.sendTransaction({
      to: foundationMultiSig.address,
      value: parseEther("2"),
    });

    const timeLock = await TimeLock.deploy(
      kapTokenAddress,
      governanceRegistry.address
    );
    const governanceV2 = await GovernanceV2.deploy(
      kapVesting.address,
      staking.address,
      timeLock.address,
      foundationMultiSig.address
    );
    await _upgradeGovernance(governanceV2, timeLock, foundationMultiSig);
    return [governanceV2, timeLock, foundationMultiSig];
  };

  const _upgradeGovernance = async (
    _governanceV2,
    _timeLock,
    _foundationMultiSig
  ) => {
    // Upgrade original governance registry
    await governanceRegistry
      .connect(_foundationMultiSig)
      .changeGovernance(_governanceV2.address);
    console.log("changeGovernance");
    await _governanceV2
      .connect(_foundationMultiSig)
      .confirmChanged(governanceRegistry.address);
    console.log("Deployed?");
    // Verify upgrade
    expect(await governanceRegistry.governance()).to.equal(
      _governanceV2.address
    );
    // Set Vesting's gov registry
    await kapVesting
      .connect(_foundationMultiSig)
      .setRegistry(governanceRegistry.address);
    expect(await kapVesting.governanceRegistry()).to.equal(
      governanceRegistry.address
    );
    // Appoint delegates
    const bigVesterSigner = await ethers.getImpersonatedSigner(
      bigVesterAddress
    );
    const smallVesterSigner = await ethers.getImpersonatedSigner(
      smallVesterAddress
    );
    await deployer.sendTransaction({
      to: bigVesterAddress,
      value: parseEther("2"),
    });
    await deployer.sendTransaction({
      to: smallVesterAddress,
      value: parseEther("2"),
    });
    await kapVesting.connect(bigVesterSigner).appointDelegate(whale.address);
    await kapVesting.connect(smallVesterSigner).appointDelegate(krill.address);
    expect(await kapVesting.votingWeight(whale.address)).to.be.gt(0);
    expect(await kapVesting.votingWeight(krill.address)).to.be.gt(0);
  };

  before(async () => {
    [deployer, whale, krill] = await ethers.getSigners();

    GovernanceV2 = await ethers.getContractFactory("GovernanceV2");

    // Create peripheral contract objects
    GovernanceRegistry = await ethers.getContractFactory("GovernanceRegistry");
    const KapVesting = await ethers.getContractFactory("KapVesting");
    const Staking = await ethers.getContractFactory("Staking");
    TimeLock = await ethers.getContractFactory("TimeLock");

    governanceRegistry = GovernanceRegistry.attach(governanceRegistryAddress);
    kapVesting = KapVesting.attach(vestingAddress);
    staking = Staking.attach(stakingAddress);
  });
  describe("Constructor", () => {
    let governanceV2, timeLock, foundationMultiSig;

    before(async () => {
      [governanceV2, timeLock, foundationMultiSig] = await loadFixture(
        deployContractsFixture
      );
    });
    it("Should deploy with correct constants", async () => {
      expect(await governanceV2.START_VOTE()).to.equal(3 * days);
      expect(await governanceV2.END_VOTE()).to.equal(6 * days);
      expect(await governanceV2.EXECUTE()).to.equal(9 * days);
      expect(await governanceV2.EXPIRE()).to.equal(12 * days);
      expect(await governanceV2.PROPOSE_COOLDOWN()).to.equal(3 * days);
      expect(await governanceV2.QUORUM()).to.equal(
        BigNumber.from(10).pow(27).mul(4).div(100)
      );
      expect(await governanceV2.THRESHOLD()).to.equal(
        BigNumber.from(10).pow(27).mul(65).div(10000)
      );
      expect(await governanceV2.UPGRADER()).to.equal(
        keccak256(utils.toUtf8Bytes("UPGRADER"))
      );
      expect(await governanceV2.VETOER()).to.equal(
        keccak256(utils.toUtf8Bytes("VETOER"))
      );
      expect(await governanceV2.VOTING_MANAGER()).to.equal(
        keccak256(utils.toUtf8Bytes("VOTING_MANAGER"))
      );
      expect(await governanceV2.PAIR()).to.equal(await staking.asset());
      expect(await governanceV2.KAP_IS_TOKEN0()).to.equal(kapIsToken0);
    });
    it("Should deploy with correct params and roles", async () => {
      expect(await governanceV2.vesting()).to.equal(kapVesting.address);
      expect(await governanceV2.staking()).to.equal(staking.address);
      expect(await governanceV2.timeLock()).to.equal(timeLock.address);

      expect(
        await governanceV2.hasRole(
          await governanceV2.UPGRADER(),
          foundationMultiSigAddress
        )
      ).to.be.true;
      expect(
        await governanceV2.hasRole(
          await governanceV2.VETOER(),
          foundationMultiSigAddress
        )
      ).to.be.true;
      expect(
        await governanceV2.hasRole(
          await governanceV2.VOTING_MANAGER(),
          foundationMultiSigAddress
        )
      ).to.be.true;

      // Should not have VETOER role
      expect(
        await governanceV2.hasRole(
          await governanceV2.UPGRADER(),
          deployer.address
        )
      ).to.be.false;
      expect(
        await governanceV2.hasRole(
          await governanceV2.VETOER(),
          deployer.address
        )
      ).to.be.false;
      expect(
        await governanceV2.hasRole(
          await governanceV2.VOTING_MANAGER(),
          deployer.address
        )
      ).to.be.false;
    });
    it("Should not deploy with invalid params", async () => {
      // Zero address
      await expect(
        GovernanceV2.deploy(
          zeroAddress,
          staking.address,
          timeLock.address,
          foundationMultiSig.address
        )
      ).to.be.revertedWith("Governance: Zero address");
      await expect(
        GovernanceV2.deploy(
          kapVesting.address,
          zeroAddress,
          timeLock.address,
          foundationMultiSig.address
        )
      ).to.be.revertedWith("Governance: Zero address");
      await expect(
        GovernanceV2.deploy(
          kapVesting.address,
          staking.address,
          zeroAddress,
          foundationMultiSig.address
        )
      ).to.be.revertedWith("Governance: Zero address");
      await expect(
        GovernanceV2.deploy(
          kapVesting.address,
          staking.address,
          timeLock.address,
          zeroAddress
        )
      ).to.be.revertedWith("Governance: Zero address");
    });
  });
  describe("Transactions", () => {
    let governanceV2, timeLock, foundationMultiSig;

    before(async () => {
      [governanceV2, timeLock, foundationMultiSig] = await loadFixture(
        deployContractsFixture
      );
    });
    describe("propose", () => {
      beforeEach(async () => {
        // Skip 3 days to avoid proposeCooldown
        await skip(3 * days);
      });
      it("Should create a valid proposal", async () => {
        const latestProposalId = await getProposalsLength(governanceV2);
        let targets = [zeroAddress];
        let values = ["0x0"];
        let data = [[]];
        await expect(governanceV2.connect(whale).propose(targets, values, data))
          .to.not.be.reverted;

        const time = await now();
        expect(await governanceV2.lastProposal(whale.address)).to.equal(time);
        const proposal = await governanceV2.proposals(latestProposalId);
        const encodedParams = utils.defaultAbiCoder.encode(
          ["address[]", "uint256[]", "bytes[]"],
          [targets, values, data]
        );
        expect(proposal.paramsHash).to.equal(keccak256(encodedParams));
        expect(proposal.time).to.equal(time);
        expect(proposal.yaysKAP).to.equal(0);
        expect(proposal.naysKAP).to.equal(0);
        expect(proposal.yaysLP).to.equal(0);
        expect(proposal.naysLP).to.equal(0);
        expect(proposal.executed).to.be.false;
        expect(proposal.vetoed).to.be.false;
        expect(proposal.priceCumulativeLast).to.be.gt(0);
      });
      it("Should revert insufficient voting weight", async () => {
        let targets = [zeroAddress];
        let values = ["0x0"];
        let data = [[]];

        await expect(
          governanceV2.connect(krill).propose(targets, values, data)
        ).to.be.revertedWith("Governance: Threshold");

        await expect(governanceV2.connect(whale).propose(targets, values, data))
          .not.to.be.reverted;
      });
      it("Should revert spam proposals", async () => {
        let targets = [zeroAddress];
        let values = ["0x0"];
        let data = [[]];

        // 1st proposal
        await governanceV2.connect(whale).propose(targets, values, data);

        // 60 seconds before cooldown expired
        await skip(3 * days - 60);
        await expect(
          governanceV2.connect(whale).propose(targets, values, data)
        ).to.be.revertedWith("Governance: Propose cooldown");

        await skip(60);
        await expect(governanceV2.connect(whale).propose(targets, values, data))
          .to.not.be.reverted;
      });
      it("Should revert invalid params", async () => {
        let targets = [zeroAddress];
        let values = ["0x0"];
        let data = [[]];
        await expect(
          governanceV2.connect(whale).propose([], values, data)
        ).to.be.revertedWith("Governance: Invalid targets");
        await expect(
          governanceV2.connect(whale).propose(targets, [], data)
        ).to.be.revertedWith("Governance: Invalid values");
        await expect(
          governanceV2
            .connect(whale)
            .propose(targets, [...values, "0x01"], data)
        ).to.be.revertedWith("Governance: Invalid values");
        await expect(
          governanceV2.connect(whale).propose(targets, values, [])
        ).to.be.revertedWith("Governance: Invalid data");
        await expect(
          governanceV2.connect(whale).propose(targets, values, [...data, []])
        ).to.be.revertedWith("Governance: Invalid data");
      });
    });
    describe("vote", () => {
      let activeProposalID;
      beforeEach(async () => {
        await skip(3 * days);
        activeProposalID = await getProposalsLength(governanceV2);
        await governanceV2
          .connect(whale)
          .propose([ethers.constants.AddressZero], ["0x0"], [[]]);
      });
      it("Should revert if invalid proposal", async () => {
        await expect(
          governanceV2.vote(BigNumber.from(activeProposalID).add(2), true)
        ).to.be.revertedWith("Governance: Invalid id");
      });
      it("Should revert if before start voting window", async () => {
        await skip(3 * days - 10);
        await expect(
          governanceV2.vote(activeProposalID, true)
        ).to.be.revertedWith("Governance: Voting window");
      });
      it("Should revert if voting with zero weight", async () => {
        await skip(3 * days);
        await expect(
          governanceV2.vote(activeProposalID, true)
        ).to.be.revertedWith("Governance: Zero weight");
      });
      it("Should successfully update vote counter", async () => {
        await skip(3 * days);
        await governanceV2.connect(whale).vote(activeProposalID, true);
        let proposal = await governanceV2.proposals(activeProposalID);
        expect(proposal.yaysKAP).to.equal(parseEther("127800000"));
        expect(proposal.naysKAP).to.equal(0);

        await governanceV2.connect(krill).vote(activeProposalID, false);
        proposal = await governanceV2.proposals(activeProposalID);
        expect(proposal.yaysKAP).to.equal(parseEther("127800000"));
        expect(proposal.naysKAP).to.equal(parseEther("3250000"));
      });
      it("Should revert if already voted", async () => {
        await skip(3 * days);
        await expect(governanceV2.connect(whale).vote(activeProposalID, true))
          .to.not.be.reverted;
        await expect(
          governanceV2.connect(whale).vote(activeProposalID, false)
        ).to.be.revertedWith("Governance: Already voted");
      });
      it("Should revert if after end voting window", async () => {
        await skip(6 * days);
        await expect(
          governanceV2.connect(krill).vote(activeProposalID, false)
        ).to.be.revertedWith("Governance: Voting window");
      });
    });
    describe("votingWeight (Vesting)", () => {
      let activeProposalID;
      beforeEach(async () => {
        await skip(3 * days);
        activeProposalID = await getProposalsLength(governanceV2);
        await governanceV2
          .connect(whale)
          .propose([ethers.constants.AddressZero], ["0x0"], [[]]);
      });
      it("Should turn off", async () => {
        expect(await governanceV2.vestingOn()).to.be.true;
        await governanceV2
          .connect(foundationMultiSig)
          .setVotingWeightSources(false, false, false);
        expect(await governanceV2.stakingOn()).to.be.false;

        // Should revert with zero voting weight
        await skip(3 * days);
        await expect(
          governanceV2.connect(whale).vote(activeProposalID, true)
        ).to.be.revertedWith("Governance: Zero weight");
        let proposal = await governanceV2.proposals(activeProposalID);
        expect(proposal.yaysKAP).to.equal(0);
        expect(proposal.naysKAP).to.equal(0);

        // Should revert with threshold
        await expect(
          governanceV2
            .connect(whale)
            .propose([ethers.constants.AddressZero], ["0x0"], [[]])
        ).to.be.revertedWith("Governance: Threshold");
      });
    });
    describe("votingWeight (Staking)", () => {
      let activeProposalID;
      let PAIR, ROUTER, staker;
      let kapToken;

      const ifacePair = new utils.Interface([
        "function token0() view returns (address)",
        "function token1() view returns (address)",
        "function totalSupply() view returns (uint256)",
        "function price0CumulativeLast() view returns (uint256)",
        "function price1CumulativeLast() view returns (uint256)",
        "function sync()",
        "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
        "function transfer(address to, uint256 amount)",
        "function balanceOf(address owner) view returns (uint)",
        "function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data)",
      ]);

      const ifaceRouter = new utils.Interface([
        "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable",
        "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)",
      ]);

      // Converts LP to KAP using current pool state
      const convertLP = async (_weightLP) => {
        const [reserveKAP] = await PAIR.getReserves();
        const totalLP = await PAIR.totalSupply();
        return _weightLP.mul(reserveKAP).div(totalLP);
      };

      // Converts LP to KAP using price cumulatives
      const convertLPCumulative = async (_proposal) => {
        await PAIR.sync();
        const blockTimestamp = BigNumber.from(await now());

        const totalLP = await PAIR.totalSupply();
        // Calculate latest k value
        const [reserve0, reserve1, _] = await PAIR.getReserves();
        const k = reserve0.mul(reserve1);
        const priceETHCumulative = (await PAIR.price1CumulativeLast())
          .sub(_proposal.priceCumulativeLast)
          .div(BigNumber.from(2).pow(112));
        const reserveKAP = sqrt(
          k.mul(priceETHCumulative).div(blockTimestamp.sub(_proposal.time))
        );

        return [
          _proposal.yaysLP.mul(reserveKAP).div(totalLP),
          _proposal.naysLP.mul(reserveKAP).div(totalLP),
        ];
      };

      const sqrt = (y) => {
        if (y.gt(3)) {
          z = y;
          x = BigNumber.from(y.div(2).add(1));
          while (x.lt(z)) {
            z = x;
            x = y.div(x).add(x).div(2);
          }
        } else if (!y.eq(0)) {
          z = 1;
        }
        return z;
      };

      before(async () => {
        PAIR = new ethers.Contract(lpTokenAddress, ifacePair, deployer);
        ROUTER = new ethers.Contract(routerAddress, ifaceRouter, deployer);
        const KapToken = await ethers.getContractFactory("Token");
        kapToken = KapToken.attach(kapTokenAddress);
        staker = await ethers.getImpersonatedSigner(stakerAddress);

        await governanceV2
          .connect(foundationMultiSig)
          .setVotingWeightSources(true, true, false);
      });
      beforeEach(async () => {
        await skip(3 * days);
        activeProposalID = await getProposalsLength(governanceV2);
        await governanceV2
          .connect(whale)
          .propose([ethers.constants.AddressZero], ["0x0"], [[]]);
        await skip(3 * days);
      });
      it("Should turn on", async () => {
        expect(await governanceV2.stakingOn()).to.be.true;
      });
      it("Should correctly count LP", async () => {
        const stakedLP = await staking.totalStaked(staker.address);
        await governanceV2.connect(staker).vote(activeProposalID, true);
        const proposal = await governanceV2.proposals(activeProposalID);
        expect(proposal.yaysLP).to.equal(stakedLP);
        expect(proposal.naysLP).to.equal(0);
      });
      it("Should correctly convert LP", async () => {
        const votingWeight = await governanceV2.getSnapVotingWeight(
          staker.address
        );
        const weightLP = await staking.totalStaked(staker.address);
        const expectedVotingWeight = await convertLP(weightLP);
        expect(votingWeight).to.equal(expectedVotingWeight);
      });
      it("Should correctly convert LP cumulative", async () => {
        await governanceV2.connect(staker).vote(activeProposalID, true);
        const proposal = await governanceV2.proposals(activeProposalID);
        const [expYaysLPConverted, expNaysLPConverted] =
          await convertLPCumulative(proposal);
        const [yaysLPConverted, naysLPConverted] =
          await governanceV2.convertLPCumulativeLast(proposal);
        expect(yaysLPConverted).to.equal(expYaysLPConverted);
        expect(naysLPConverted).to.equal(expNaysLPConverted);

        // Swap out KAP
        await ROUTER.swapExactETHForTokens(
          0, // amountOutMin
          [wethAddress, kapTokenAddress], // path
          deployer.address, // to
          ethers.constants.MaxUint256, // deadline
          { value: parseEther("1") }
        );

        // LP conversion should be lower
        await skip(3 * days);
        await PAIR.sync();
        const [yaysLPConvertedLower, naysLPConvertedLower] =
          await governanceV2.convertLPCumulativeLast(proposal);
        expect(yaysLPConvertedLower).to.be.lt(yaysLPConverted);
        expect(naysLPConvertedLower).to.equal(naysLPConverted);

        // Swap back in KAP
        await kapToken.approve(ROUTER.address, ethers.constants.MaxUint256);
        const amountInKap = await kapToken.balanceOf(deployer.address);
        await ROUTER.swapExactTokensForETH(
          amountInKap,
          0,
          [kapTokenAddress, wethAddress],
          deployer.address,
          ethers.constants.MaxUint256
        );

        // LP conversion should be higher than ...LPConvertedLower
        await skip(3 * days);
        await PAIR.sync();
        const [yaysLPConvertedHigher, naysLPConvertedHigher] =
          await governanceV2.convertLPCumulativeLast(proposal);
        expect(yaysLPConvertedHigher).to.be.gt(yaysLPConvertedLower);
        expect(naysLPConvertedHigher).to.equal(naysLPConvertedLower);
      });
      it("Should turn off", async () => {
        expect(await governanceV2.stakingOn()).to.be.true;
        await governanceV2
          .connect(foundationMultiSig)
          .setVotingWeightSources(true, false, false);
        expect(await governanceV2.stakingOn()).to.be.false;
      });
    });
    describe("votingWeight (TimeLock)", () => {
      let kapToken;
      let holder;
      const lockedAmount = 17;
      before(async () => {
        const KapToken = await ethers.getContractFactory("Token");
        kapToken = KapToken.attach(kapTokenAddress);
        holder = await ethers.getImpersonatedSigner(holderAddress);

        // Lock tokens and assign delegate in TimeLock
        await deployer.sendTransaction({
          to: holder.address,
          value: parseEther("2"),
        });
        await kapToken.connect(holder).approve(timeLock.address, lockedAmount);
        await timeLock.connect(holder).lock(lockedAmount);
        await skip(3 * days);
        await timeLock.connect(holder).appointDelegate(holder.address);

        await governanceV2
          .connect(foundationMultiSig)
          .setVotingWeightSources(true, true, true);
      });
      beforeEach(async () => {
        await skip(3 * days);
        activeProposalID = await getProposalsLength(governanceV2);
        await governanceV2
          .connect(whale)
          .propose([ethers.constants.AddressZero], ["0x0"], [[]]);
        await skip(3 * days);
      });
      it("Should turn on", async () => {
        expect(await governanceV2.timeLockOn()).to.be.true;
      });
      it("Should successfully update vote counter", async () => {
        let proposal = await governanceV2.proposals(activeProposalID);
        expect(proposal.yaysKAP).to.equal(0);
        await governanceV2.connect(holder).vote(activeProposalID, true);
        proposal = await governanceV2.proposals(activeProposalID);
        expect(proposal.yaysKAP).to.equal(lockedAmount);
      });
      it("Should turn off", async () => {
        await governanceV2
          .connect(foundationMultiSig)
          .setVotingWeightSources(true, true, false);
        expect(await governanceV2.timeLockOn()).to.be.false;
      });
    });
    describe("execute", () => {
      let targets, values, data;
      let targetsEth, valuesEth, dataEth;
      let callTester;
      before(async () => {
        const CallTester = await ethers.getContractFactory("CallTester");
        callTester = await CallTester.deploy();

        targets = [callTester.address];
        values = ["0x0"];
        data = [CallTester.interface.encodeFunctionData("testCall", [123])];

        targetsEth = [callTester.address];
        valuesEth = ["0x1"];
        dataEth = [
          CallTester.interface.encodeFunctionData("testCallEther", []),
        ];
      });
      it("Should revert if invalid proposal", async () => {
        const latestProposalId = await getProposalsLength(governanceV2);
        await expect(
          governanceV2.execute(latestProposalId, targets, values, data)
        ).to.be.revertedWith("Governance: Invalid id");
      });
      it("Should revert if params hash does not match", async () => {
        const latestProposalId = await getProposalsLength(governanceV2);
        await skip(3 * days);
        await governanceV2.connect(whale).propose(targets, values, data);
        await skip(9 * days);
        await expect(
          governanceV2.execute(latestProposalId, targets, valuesEth, data)
        ).to.be.revertedWith("Governance: Transact params");
      });
      it("Should revert if yays <= nays", async () => {
        const latestProposalId = await getProposalsLength(governanceV2);
        await skip(3 * days);
        await governanceV2.connect(whale).propose(targets, values, data);
        // Vote against
        await skip(3 * days);
        await governanceV2.connect(whale).vote(latestProposalId, false);
        await governanceV2.connect(krill).vote(latestProposalId, true);

        await skip(3 * days);
        await expect(
          governanceV2.execute(latestProposalId, targets, values, data)
        ).to.be.revertedWith("Governance: Unsuccessful");
      });
      it("Should revert if before start executing window", async () => {
        const latestProposalId = await getProposalsLength(governanceV2);
        await skip(3 * days);
        await governanceV2.connect(whale).propose(targets, values, data);
        // Vote For
        await skip(3 * days);
        await governanceV2.connect(whale).vote(latestProposalId, true);

        await expect(
          governanceV2.execute(latestProposalId, targets, values, data)
        ).to.be.revertedWith("Governance: Execution window");
      });
      it("Should revert if yays + nays < quorum", async () => {
        const latestProposalId = await getProposalsLength(governanceV2);
        await skip(3 * days);
        await governanceV2.connect(whale).propose(targets, values, data);
        // Vote For
        await skip(3 * days);
        await governanceV2.connect(krill).vote(latestProposalId, true);

        await skip(6 * days);
        await expect(
          governanceV2.execute(latestProposalId, targets, values, data)
        ).to.be.revertedWith("Governance: Quorum");
      });
      it("Should revert if balance insufficient", async () => {
        const latestProposalId = await getProposalsLength(governanceV2);
        await skip(3 * days);
        await governanceV2
          .connect(whale)
          .propose(targetsEth, valuesEth, dataEth);
        // Vote For
        await skip(3 * days);
        await governanceV2.connect(whale).vote(latestProposalId, true);

        await skip(6 * days);
        await expect(
          governanceV2.execute(
            latestProposalId,
            targetsEth,
            valuesEth,
            dataEth,
            {
              value: 0,
            }
          )
        ).to.be.reverted;
      });
      it("Should successfully send ETH", async () => {
        let latestProposalId = await getProposalsLength(governanceV2);
        await skip(3 * days);
        await governanceV2
          .connect(whale)
          .propose(targetsEth, valuesEth, dataEth);
        // Vote For
        await skip(3 * days);
        await governanceV2.connect(whale).vote(latestProposalId, true);

        await skip(6 * days);
        expect(await callTester.getBal()).to.equal(0);
        await expect(
          governanceV2.execute(
            latestProposalId,
            targetsEth,
            valuesEth,
            dataEth,
            {
              value: 1,
            }
          )
        ).to.not.be.reverted;
        expect(await callTester.getBal()).to.equal(1);

        expect(await ethers.provider.getBalance(governanceV2.address)).to.equal(
          0
        );

        // deposit ETH directly to contract, and execute with 0 value
        await whale.sendTransaction({
          to: governanceV2.address,
          value: utils.parseUnits("1", "wei"),
        });
        await skip(3 * days);
        latestProposalId = await getProposalsLength(governanceV2);
        await governanceV2
          .connect(whale)
          .propose(targetsEth, valuesEth, dataEth);
        await skip(3 * days);
        await governanceV2.connect(whale).vote(latestProposalId, true);
        await skip(6 * days);
        await expect(
          governanceV2.execute(
            latestProposalId,
            targetsEth,
            valuesEth,
            dataEth,
            {
              value: 0,
            }
          )
        ).to.not.be.reverted;

        expect(await callTester.getBal()).to.equal(2);
        expect(await ethers.provider.getBalance(governanceV2.address)).to.equal(
          0
        );
      });
      it("Should successfully execute target contract", async () => {
        const latestProposalId = await getProposalsLength(governanceV2);
        await skip(3 * days);
        await governanceV2.connect(whale).propose(targets, values, data);
        // Vote For
        await skip(3 * days);
        await governanceV2.connect(whale).vote(latestProposalId, true);

        await skip(6 * days);
        await expect(
          governanceV2.execute(latestProposalId, targets, values, data)
        ).to.not.be.reverted;

        // verify execution result
        expect(await callTester.execResult()).to.equal(123);
      });
      it("Should revert if already executed", async () => {
        const latestProposalId = (await getProposalsLength(governanceV2)) - 1;

        await expect(
          governanceV2.execute(latestProposalId, targets, values, data)
        ).to.be.revertedWith("Governance: Already executed");
      });
      it("Should revert if after expired executing window", async () => {
        const latestProposalId = await getProposalsLength(governanceV2);
        await skip(3 * days);
        await governanceV2.connect(whale).propose(targets, values, data);
        // Vote For
        await skip(3 * days);
        await governanceV2.connect(whale).vote(latestProposalId, true);

        await skip(9 * days);
        await expect(
          governanceV2.execute(latestProposalId, targets, values, data)
        ).to.be.revertedWith("Governance: Execution window");
      });
    });
    describe("veto", () => {
      let targets, values, data;
      before(async () => {
        targets = [zeroAddress];
        values = ["0x0"];
        data = [[]];
      });
      it("Should revert if invalid Id", async () => {
        const latestProposalId = await getProposalsLength(governanceV2);

        await expect(
          governanceV2.connect(foundationMultiSig).veto(latestProposalId)
        ).to.be.revertedWith("Governance: Invalid id");
      });
      it("Should revert if already executed", async () => {
        const latestProposalId = await getProposalsLength(governanceV2);
        await skip(3 * days);
        await governanceV2.connect(whale).propose(targets, values, data);
        // Vote For
        await skip(3 * days);
        await governanceV2.connect(whale).vote(latestProposalId, true);

        await skip(6 * days);
        await expect(
          governanceV2.execute(latestProposalId, targets, values, data)
        ).to.not.be.reverted;

        await expect(
          governanceV2.connect(foundationMultiSig).veto(latestProposalId)
        ).to.be.revertedWith("Governance: Already executed");
      });
      it("Should successfully veto a proposal", async () => {
        const latestProposalId = await getProposalsLength(governanceV2);
        await skip(3 * days);
        await governanceV2.connect(whale).propose(targets, values, data);

        await governanceV2.connect(foundationMultiSig).veto(latestProposalId);

        const proposal = await governanceV2.proposals(latestProposalId);
        expect(proposal.vetoed).to.be.true;
      });
      it("Should revert if already vetoed", async () => {
        const latestProposalId = await getProposalsLength(governanceV2);
        await skip(3 * days);
        await governanceV2.connect(whale).propose(targets, values, data);

        await governanceV2.connect(foundationMultiSig).veto(latestProposalId);

        await expect(
          governanceV2.connect(foundationMultiSig).veto(latestProposalId)
        ).to.be.revertedWith("Governance: Already vetoed");
      });
      it("Should revert voting if proposal vetoed", async () => {
        const latestProposalId = await getProposalsLength(governanceV2);
        await skip(3 * days);
        await governanceV2.connect(whale).propose(targets, values, data);

        await governanceV2.connect(foundationMultiSig).veto(latestProposalId);

        await skip(3 * days);
        await expect(
          governanceV2.connect(whale).vote(latestProposalId, false)
        ).to.be.revertedWith("Governance: Vetoed");
      });
      it("Should revert execution if proposal vetoed", async () => {
        const latestProposalId = await getProposalsLength(governanceV2);
        await skip(3 * days);
        await governanceV2.connect(whale).propose(targets, values, data);
        // Vote For
        await skip(3 * days);
        await governanceV2.connect(whale).vote(latestProposalId, true);

        await governanceV2.connect(foundationMultiSig).veto(latestProposalId);

        await skip(6 * days);
        await expect(
          governanceV2.execute(latestProposalId, targets, values, data)
        ).to.be.revertedWith("Governance: Vetoed");
      });
    });
  });
  describe("Queries", () => {
    before(async () => {
      [governanceV2, timeLock] = await loadFixture(deployContractsFixture);
    });
    describe("votingPeriod", () => {
      it("Should report the correct votingPeriod", async () => {
        expect(await governanceV2.votingPeriod()).to.equal(3 * days);
      });
    });
    describe("getVotingWeight", () => {
      it("Should report the correct votingWeight", async () => {
        expect(await governanceV2.getSnapVotingWeight(whale.address)).to.equal(
          parseEther("127800000")
        );
      });
    });
    describe("getProposals", () => {
      it("Should return all proposals", async () => {
        let proposals;
        const targets = [ethers.constants.AddressZero];
        const values = ["0x0"];
        const data = [[]];
        const encodedParams = utils.defaultAbiCoder.encode(
          ["address[]", "uint256[]", "bytes[]"],
          [targets, values, data]
        );
        const hashedParams = keccak256(encodedParams);

        const startingProposalsLength = (await governanceV2.getProposals())
          .length;

        const verifyProposals = (_proposals) => {
          const proposalsLength = _proposals.length;
          for (i = startingProposalsLength; i < proposalsLength; ++i) {
            const proposal = _proposals[i];
            expect(proposal.paramsHash).to.equal(hashedParams);
            expect(proposal.yaysKAP).to.equal(0);
            expect(proposal.naysKAP).to.equal(0);
            expect(proposal.yaysLP).to.equal(0);
            expect(proposal.naysLP).to.equal(0);
            expect(proposal.executed).to.be.false;
            expect(proposal.vetoed).to.be.false;
            expect(proposal.priceCumulativeLast).to.be.gt(0);
          }
        };

        // 1 more proposal
        await governanceV2
          .connect(whale)
          .propose([ethers.constants.AddressZero], ["0x0"], [[]]);
        proposals = await governanceV2.getProposals();
        expect(proposals.length).to.equal(startingProposalsLength + 1);
        verifyProposals(proposals);

        // 20 more proposals
        for (let i = 0; i < 20; i++) {
          await skip(3 * days);
          await governanceV2
            .connect(whale)
            .propose([ethers.constants.AddressZero], ["0x0"], [[]]);
        }
        proposals = await governanceV2.getProposals();
        expect(proposals.length).to.equal(startingProposalsLength + 21);
        verifyProposals(proposals);
      });
    });
  });
  describe("Edge cases", () => {
    let targets, values, data;

    const skip = async (time) => {
      await ethers.provider.send("evm_increaseTime", [time]);
      await ethers.provider.send("evm_mine");
    };
    before(async () => {
      [governanceV2, timeLock] = await loadFixture(deployContractsFixture);

      targets = [zeroAddress];
      values = ["0x0"];
      data = [[]];
    });
    it("Should revert if timestamp uint96 overflow", async () => {
      const skipTime = Number.MAX_SAFE_INTEGER;
      for (i = 0; i < 8; ++i) {
        await skip(skipTime);
      }
      await expect(
        governanceV2.connect(whale).propose(targets, values, data)
      ).to.be.revertedWith("Governance: Overflow");
    });
  });
  after(async () => {
    // Remove fork and reset timestamp for other tests
    await ethers.provider.send("hardhat_reset");
  });
});
