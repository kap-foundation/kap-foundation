require("dotenv").config();
const { ethers } = require("hardhat");
const { expect } = require("chai");
const factoryAbi = require("@uniswap/v2-core/build/IUniswapV2Factory.json").abi;
const routerAbi = require("@uniswap/v2-periphery/build/IUniswapV2Router02.json").abi;
const pairAbi = require("@uniswap/v2-core/build/IUniswapV2Pair.json").abi;
const { getContractAddress } = require("@ethersproject/address");

const day = 60 * 60 * 24;

// for Uniswap v2 pool verifications
function sqrt(y) {
  if (y.gt(ethers.BigNumber.from(3))) {
      z = y;
      x = y.div(ethers.BigNumber.from(2)).add(ethers.BigNumber.from(1));
      while (x.lt(z)) {
          z = x;
          x = (y.div(x).add(x)).div(ethers.BigNumber.from(2));
      }
  } else if (y.gt(0)) {
      z = ethers.BigNumber.from(1);
  }
  return z;
}

async function main() {
  const [deployer, _] = await ethers.getSigners();

  const teamMultisig = process.env.TEAM_MULTISIG_ADDRESS;
  const MINIMUM_LIQUIDITY = ethers.BigNumber.from(1000);

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Deployer WEI balance:", (await deployer.getBalance()).toString());

  // Deploy KAP token
  const KAP = await ethers.getContractFactory("Token");
  const kap = await KAP.deploy();
  await kap.deployed();
  expect(await kap.name()).to.equal("Kapital DAO Token");
  expect(await kap.symbol()).to.equal("KAP");
  const kapTotalSupply = await kap.totalSupply();
  expect(kapTotalSupply).to.equal(ethers.BigNumber.from(10).pow(9 + 18));
  expect(await kap.balanceOf(deployer.address)).to.equal(kapTotalSupply);
  console.log("KAP Token deployed at:", kap.address);

  // Deploy KAP-ETH Uniswap v2 pool (for general community use)
  
  // confirm that the pool does not already exist
  const factoryAddress = process.env.UNISWAP_FACTORY;
  const factory = await ethers.getContractAt(factoryAbi, factoryAddress);
  const weth9Address = await process.env.WETH9_ADDRESS;
  expect(await factory.getPair(kap.address, weth9Address)).to.equal(
    ethers.constants.AddressZero
  ); // pair address is zero before pool creation
  
  // create pool by adding liquidity

  // approve KAP token
  const routerAddress = process.env.UNISWAP_ROUTER;
  const router = await ethers.getContractAt(routerAbi, routerAddress);
  blockTime = parseInt((await ethers.provider.getBlock()).timestamp);
  approvalTx = await kap.approve(routerAddress, ethers.BigNumber.from(10).pow(18));
  await approvalTx.wait();

  // add liquidity
  const amountKAP = ethers.BigNumber.from(10).pow(18);
  const amountETH = ethers.BigNumber.from(10).pow(15);
  addLiquidityTx = await router.addLiquidityETH(
    kap.address,
    amountKAP, // KAP in liquidity
    amountKAP, // Minimum acceptable KAP in liquidity
    amountETH, // ETH in liquidity (must supply via tx value)
    deployer.address, // LP token recipient
    blockTime + (60 * 10), // transaction expires after 10 minutes
    {value: amountETH}
  );
  await addLiquidityTx.wait();

  // confirm pool creation
  pairAddress = await factory.getPair(kap.address, weth9Address);
  expect(pairAddress).to.not.equal(ethers.constants.AddressZero); // pair address becomes nonzero after pool creation
  const kapEthPair = await ethers.getContractAt(pairAbi, pairAddress);
  const kapIsTokenZero = kap.address == await kapEthPair.token0() ? true : false;
  const reserves = await kapEthPair.getReserves();
  if (kapIsTokenZero) {
    expect(reserves.reserve0).to.equal(amountKAP);
    expect(reserves.reserve1).to.equal(amountETH);
  } else {
    expect(reserves.reserve0).to.equal(amountETH);
    expect(reserves.reserve1).to.equal(amountKAP);
  }
  expect(reserves.blockTimestampLast).to.equal(
    (await ethers.provider.getBlock(
      addLiquidityTx.blockNumber
    )).timestamp
  );
  
  // confirm correct liquidity token balances
  expect(await kapEthPair.balanceOf(ethers.constants.AddressZero)).to.equal(
    MINIMUM_LIQUIDITY
  );
  const liquidity = sqrt(amountKAP.mul(amountETH)).sub(MINIMUM_LIQUIDITY);
  expect(await kapEthPair.balanceOf(deployer.address)).to.equal(liquidity);
  expect(await kapEthPair.totalSupply()).to.equal(
    liquidity.add(MINIMUM_LIQUIDITY)
  );
  expect(
    await kapEthPair.price0CumulativeLast()
  ).to.equal(0); // cumulative prices are zero at pool creation block
  expect(await kapEthPair.price1CumulativeLast()).to.equal(0);

  console.log("KAP-ETH Uniswap v2 pool deployed at: " + pairAddress);
  console.log("Transferred 1 KAP to KAP-ETH pool");

  // Pre-determine governance registry and rewards locker contract addresses
  const txCount = await deployer.getTransactionCount();
  predictedRewardsLockerAddress = getContractAddress({
    from: deployer.address,
    nonce: txCount + 2,
  });

  predictedGovernanceRegistryAddress = getContractAddress({
    from: deployer.address,
    nonce: txCount + 4,
  });

  predictedFutureInvestorsAddress = getContractAddress({
    from: deployer.address,
    nonce: txCount + 8
  });

  // Deploy vesting contract
  VESTING_CREATOR = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("VESTING_CREATOR")
  );
  const Vesting = await ethers.getContractFactory("Vesting");
  const vesting = await Vesting.deploy(
    teamMultisig,
    predictedFutureInvestorsAddress,
    kap.address,
    predictedGovernanceRegistryAddress
  );
  await vesting.deployed();
  expect(await vesting.kapToken()).to.equal(kap.address);
  expect(await vesting.governanceRegistry()).to.equal(predictedGovernanceRegistryAddress);
  expect(await vesting.hasRole(VESTING_CREATOR, deployer.address)).to.be.true;
  expect(await vesting.hasRole(VESTING_CREATOR, teamMultisig)).to.be.true;
  expect(await vesting.hasRole(VESTING_CREATOR, predictedFutureInvestorsAddress)).to.be.true;
  console.log("Vesting contract deployed at:", vesting.address);

  // Deploy LP staking pool
  const Staking = await ethers.getContractFactory("Staking");
  const staking = await Staking.deploy(
    pairAddress,
    predictedGovernanceRegistryAddress,
    predictedRewardsLockerAddress,
    teamMultisig
  );
  await staking.deployed();
  expect(await staking.asset()).to.equal(pairAddress);
  expect(await staking.governanceRegistry()).to.equal(predictedGovernanceRegistryAddress);
  expect(await staking.rewardsLocker()).to.equal(predictedRewardsLockerAddress);
  TEAM_MULTISIG_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("TEAM_MULTISIG"));
  expect(await staking.hasRole(TEAM_MULTISIG_ROLE, teamMultisig)).to.be.true;
  expect(await staking.getRoleMemberCount(TEAM_MULTISIG_ROLE)).to.equal(1);
  console.log("Staking deployed at:", staking.address);

  // Deploy RewardsLocker contract
  KAP_SAVER = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("KAP_SAVER"));
  LOCK_CREATOR = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("LOCK_CREATOR"));
  const RewardsLocker = await ethers.getContractFactory("RewardsLocker");
  const rewardsLocker = await RewardsLocker.deploy(
    staking.address,
    predictedGovernanceRegistryAddress,
    kap.address,
    teamMultisig
  );
  await rewardsLocker.deployed();
  expect(rewardsLocker.address).to.equal(predictedRewardsLockerAddress);
  expect(await rewardsLocker.hasRole(LOCK_CREATOR, staking.address)).to.be.true;
  expect(await rewardsLocker.governanceRegistry()).to.equal(predictedGovernanceRegistryAddress);
  expect(await rewardsLocker.kapToken()).to.equal(kap.address);
  expect(await rewardsLocker.hasRole(KAP_SAVER, teamMultisig)).to.be.true;
  console.log("RewardsLocker contract deployed at:", rewardsLocker.address);

  // Deploy governance
  const Governance = await ethers.getContractFactory("Governance");
  const governance = await Governance.deploy(vesting.address, teamMultisig);
  await governance.deployed();
  expect(await governance.vesting()).to.equal(vesting.address);
  VETOER = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("VETOER"));
  expect(await governance.hasRole(VETOER, teamMultisig)).to.be.true;
  console.log("Governance contract deployed at:", governance.address);

  // Deploy the governance registry
  const GovernanceRegistry = await ethers.getContractFactory("GovernanceRegistry");
  const governanceRegistry = await GovernanceRegistry.deploy(governance.address);
  await governanceRegistry.deployed();
  expect(await governanceRegistry.address).to.equal(predictedGovernanceRegistryAddress);
  expect(await governanceRegistry.governance()).to.equal(governance.address);
  console.log("Governance registry deployed at:", governanceRegistry.address);

  // Deploy the governance funds
  const GovernanceFund = await ethers.getContractFactory("GovernanceFund");
  // Treasury
  const treasury = await GovernanceFund.deploy(governanceRegistry.address);
  await treasury.deployed();
  expect(await treasury.governanceRegistry()).to.equal(
    governanceRegistry.address
  );
  console.log("Treasury fund deployed at:", treasury.address);
  // Community incentives
  const communityIncentives = await GovernanceFund.deploy(
    governanceRegistry.address
  );
  await communityIncentives.deployed();
  expect(await communityIncentives.governanceRegistry()).to.equal(
    governanceRegistry.address
  );
  console.log(
    "Community incentives fund deployed at:",
    communityIncentives.address
  );
  // Revenue
  const revenue = await GovernanceFund.deploy(governanceRegistry.address);
  await revenue.deployed();
  expect(await revenue.governanceRegistry()).to.equal(
    governanceRegistry.address
  );
  console.log("Revenue fund deployed at:", revenue.address);

  // Deploy funds owned by team multisig
  const MultisigFund = await ethers.getContractFactory("MultisigFund");
  // Deploy future investors fund
  const futureInvestorsFund = await MultisigFund.deploy(teamMultisig);
  await futureInvestorsFund.deployed();
  expect(futureInvestorsFund.address).to.equal(predictedFutureInvestorsAddress);
  expect(await futureInvestorsFund.multisig()).to.equal(teamMultisig);
  console.log(
    "Future investors fund deployed at:",
    futureInvestorsFund.address
  );
  // Deploy IDO fund
  const idoFund = await MultisigFund.deploy(teamMultisig);
  await idoFund.deployed();
  expect(await idoFund.multisig()).to.equal(teamMultisig);
  console.log("IDO fund deployed at:", idoFund.address);
  // Deploy DEX liquidity fund
  const dexLiquidityFund = await MultisigFund.deploy(teamMultisig);
  await dexLiquidityFund.deployed();
  expect(await dexLiquidityFund.multisig()).to.equal(teamMultisig);
  console.log("DEX liquidity fund deployed at:", dexLiquidityFund.address);
  // Deploy CEX liquidity fund
  const cexLiquidityFund = await MultisigFund.deploy(teamMultisig);
  await cexLiquidityFund.deployed();
  expect(await cexLiquidityFund.multisig()).to.equal(teamMultisig);
  console.log("CEX liquidity fund deployed at:", cexLiquidityFund.address);

  // Distribute KAP tokens as described in README.md
  // 1 KAP was already used to create the KAP-ETH pool
  totalAccountedKAP = ethers.BigNumber.from(10).pow(18);

  // 37% to community incentives
  const transferToCommunityIncentives = await kap.transfer(
    communityIncentives.address,
    kapTotalSupply.mul(37).div(100)
  );
  await transferToCommunityIncentives.wait();
  expect(await kap.balanceOf(communityIncentives.address)).to.equal(
    kapTotalSupply.mul(37).div(100)
  );
  console.log(
    "Transferred",
    (await kap.balanceOf(communityIncentives.address))
      .div(ethers.BigNumber.from(10).pow(18))
      .toString(),
    "KAP to community incentives fund"
  );
  totalAccountedKAP = totalAccountedKAP.add(
    await kap.balanceOf(communityIncentives.address)
  );

  // 12.5% to treasury
  const transferToTreasury = await kap.transfer(
    treasury.address,
    kapTotalSupply.mul(125).div(1000)
  );
  await transferToTreasury.wait();
  expect(await kap.balanceOf(treasury.address)).to.equal(
    kapTotalSupply.mul(125).div(1000)
  );
  console.log(
    "Transferred",
    (await kap.balanceOf(treasury.address))
      .div(ethers.BigNumber.from(10).pow(18))
      .toString(),
    "KAP to treasury"
  );
  totalAccountedKAP = totalAccountedKAP.add(
    await kap.balanceOf(treasury.address)
  );

  // 8% to rewards locker
  const transferToRewardsLocker = await kap.transfer(
    rewardsLocker.address,
    kapTotalSupply.mul(8).div(100)
  );
  await transferToRewardsLocker.wait();
  expect(await kap.balanceOf(rewardsLocker.address)).to.equal(
    kapTotalSupply.mul(8).div(100)
  );
  console.log(
    "Transferred",
    (await kap.balanceOf(rewardsLocker.address))
      .div(ethers.BigNumber.from(10).pow(18))
      .toString(),
    "KAP to rewards locker"
  );
  totalAccountedKAP = totalAccountedKAP.add(
    await kap.balanceOf(rewardsLocker.address)
  );

  // 6.25% to team multisig
  const transferToTeamMultisig = await kap.transfer(
    teamMultisig,
    kapTotalSupply.mul(625).div(10000)
  );
  await transferToTeamMultisig.wait();
  expect(await kap.balanceOf(teamMultisig)).to.equal(
    kapTotalSupply.mul(625).div(10000)
  );
  console.log(
    "Transferred",
    (await kap.balanceOf(teamMultisig))
      .div(ethers.BigNumber.from(10).pow(18))
      .toString(),
    "KAP to team multisig"
  );
  totalAccountedKAP = totalAccountedKAP.add(
    await kap.balanceOf(teamMultisig)
  );

  // 2.5% to future investors fund
  const transferToFutureInvestorsFund = await kap.transfer(
    futureInvestorsFund.address,
    kapTotalSupply.mul(25).div(1000)
  );
  await transferToFutureInvestorsFund.wait();
  expect(await kap.balanceOf(futureInvestorsFund.address)).to.equal(
    kapTotalSupply.mul(25).div(1000)
  );
  console.log(
    "Transferred",
    (await kap.balanceOf(futureInvestorsFund.address))
      .div(ethers.BigNumber.from(10).pow(18))
      .toString(),
    "KAP to future investors fund"
  );
  totalAccountedKAP = totalAccountedKAP.add(
    await kap.balanceOf(futureInvestorsFund.address)
  );

  // 2% to IDO fund
  const transferToIdoFund = await kap.transfer(
    idoFund.address,
    kapTotalSupply.mul(2).div(100)
  );
  await transferToIdoFund.wait();
  expect(await kap.balanceOf(idoFund.address)).to.equal(
    kapTotalSupply.mul(2).div(100)
  );
  console.log(
    "Transferred",
    (await kap.balanceOf(idoFund.address))
      .div(ethers.BigNumber.from(10).pow(18))
      .toString(),
    "KAP to IDO fund"
  );
  totalAccountedKAP = totalAccountedKAP.add(
    await kap.balanceOf(idoFund.address)
  );

  // 1.5% to DEX liquidity fund, but remove the 1 KAP token that is already
  // present in the KAP-ETH liquidity pool
  const transferToDexLiquidityFund = await kap.transfer(
    dexLiquidityFund.address,
    (kapTotalSupply.mul(15).div(1000)).sub(
      ethers.BigNumber.from(10).pow(18)
    )
  );
  await transferToDexLiquidityFund.wait();
  expect(await kap.balanceOf(dexLiquidityFund.address)).to.equal(
    (kapTotalSupply.mul(15).div(1000)).sub(
      ethers.BigNumber.from(10).pow(18)
    )
  );
  console.log(
    "Transferred",
    (await kap.balanceOf(dexLiquidityFund.address))
      .div(ethers.BigNumber.from(10).pow(18))
      .toString(),
    "KAP to DEX liquidity fund"
  );
  totalAccountedKAP = totalAccountedKAP.add(
    await kap.balanceOf(dexLiquidityFund.address)
  );

  // 1.5% to CEX liquidity fund
  const transferToCexLiquidityFund = await kap.transfer(
    cexLiquidityFund.address,
    kapTotalSupply.mul(15).div(1000)
  );
  await transferToCexLiquidityFund.wait();
  expect(await kap.balanceOf(cexLiquidityFund.address)).to.equal(
    kapTotalSupply.mul(15).div(1000)
  );
  console.log(
    "Transferred",
    (await kap.balanceOf(cexLiquidityFund.address))
      .div(ethers.BigNumber.from(10).pow(18))
      .toString(),
    "KAP to CEX liquidity fund"
  );
  totalAccountedKAP = totalAccountedKAP.add(
    await kap.balanceOf(cexLiquidityFund.address)
  );

  // 28.75% left over for subsequent creation of vesting agreements
  expect(await kap.balanceOf(deployer.address)).to.equal(
    kapTotalSupply.mul(2875).div(10000)
  );

  // create vesting agreements
  // *CONCEPTUAL IMPLEMENTATION, REAL VESTING AGREEMENTS WILL BE MORE COMPLEX*
  const vestStart =
    (await ethers.provider.getBlock("latest")).timestamp + day * 7 * 52;
  const vestPeriod = day * 7 * 52
  const approveTx = await kap.approve(
    vesting.address,
    ethers.constants.MaxUint256
  );
  await approveTx.wait();
  const vestingAgreementTx = await vesting.createVestingAgreement(
    teamMultisig,
    vestStart,
    vestPeriod,
    kapTotalSupply.mul(2875).div(10000)
  );
  await vestingAgreementTx.wait();
  const multisigVestingAgreement = await vesting.vestingAgreements(teamMultisig, 0);

  expect(
    multisigVestingAgreement.vestStart
  ).to.equal(vestStart);
  expect(
    multisigVestingAgreement.vestPeriod
  ).to.equal(vestPeriod);
  expect(
    multisigVestingAgreement.totalAmount
  ).to.equal(kapTotalSupply.mul(2875).div(10000));
  console.log(
    (await kap.balanceOf(vesting.address))
      .div(ethers.BigNumber.from(10).pow(18))
      .toString(),
    "KAP used to create vesting agreements"
  );

  totalAccountedKAP = totalAccountedKAP.add(
    await kap.balanceOf(vesting.address)
  );

  // total KAP allocations should add to 1 billion
  expect(totalAccountedKAP).to.equal(ethers.BigNumber.from(10).pow(18 + 9));
  console.log(
    "Total accounted KAP:",
    (totalAccountedKAP.div(ethers.BigNumber.from(10).pow(18))).toString()
  );

  // deployer should have spent all its KAP
  expect(await kap.balanceOf(deployer.address)).to.equal(0);
  console.log(
    "Remaining deployer KAP balance:",
    (await kap.balanceOf(deployer.address)).toString()
  );

  // deployer renounces VESTING_CREATOR role
  const renounceTx = await vesting.renounceRole(
    VESTING_CREATOR,
    deployer.address
  );
  await renounceTx.wait();
  expect(await vesting.hasRole(VESTING_CREATOR, deployer.address)).to.be.false;
  console.log("Deployer has renounced VESTING_CREATOR role");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
