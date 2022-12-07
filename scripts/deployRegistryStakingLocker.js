const { ethers } = require("hardhat");
const { expect } = require("chai");

// For deterministically predicting contract deployment addresses
const {
  getContractAddress,
  getAddress: checksum,
} = require("@ethersproject/address");

// These constants can be set in the env
const foundationMultiSigAddress = checksum(
  "0xbc450C9EcED158c6bD1AFfA8D37153E278e63e68"
);
const kapTokenAddress = checksum("0x9625ce7753ace1fa1865a47aae2c5c2ce4418569");
const lpTokenAddress = checksum("0x48200057593487b93311B03C845AFdA306a90e2a");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  const [deployer] = await ethers.getSigners();

  // Get contract factories
  const GovernanceRegistry = await ethers.getContractFactory(
    "GovernanceRegistry"
  );
  const RewardsLocker = await ethers.getContractFactory("RewardsLocker");
  const Staking = await ethers.getContractFactory("Staking");

  // Deploy Governance Registry
  const governanceRegistry = await GovernanceRegistry.deploy(
    foundationMultiSigAddress // stand-in for initial governance
  );
  await sleep(30000);
  await governanceRegistry.deployed();
  console.log("Governance Registry deployed:", governanceRegistry.address);

  // Deploy Rewards Locker with predicted Staking address
  const txCount = await deployer.getTransactionCount();
  predictedStakingAddress = getContractAddress({
    from: deployer.address,
    nonce: txCount + 1,
  });
  const rewardsLocker = await RewardsLocker.deploy(
    predictedStakingAddress,
    governanceRegistry.address,
    kapTokenAddress,
    foundationMultiSigAddress
  );
  await sleep(30000);
  await rewardsLocker.deployed();
  console.log("Rewards Locker deployed:", rewardsLocker.address);

  // Deploy Staking
  const staking = await Staking.deploy(
    lpTokenAddress,
    governanceRegistry.address,
    rewardsLocker.address,
    foundationMultiSigAddress
  );
  await sleep(30000);
  await staking.deployed();
  console.log("Staking deployed:", staking.address);

  // Verify deployment
  expect(await governanceRegistry.governance()).to.equal(
    foundationMultiSigAddress
  );
  console.log("Governance Registry deployment verified");

  expect(staking.address).to.equal(predictedStakingAddress);
  expect(
    await rewardsLocker.hasRole(
      await rewardsLocker.LOCK_CREATOR(),
      staking.address
    )
  ).to.be.true;
  expect(await rewardsLocker.governanceRegistry()).to.equal(
    governanceRegistry.address
  );
  expect(await rewardsLocker.kapToken()).to.equal(kapTokenAddress);
  expect(
    await rewardsLocker.hasRole(
      await rewardsLocker.KAP_SAVER(),
      foundationMultiSigAddress
    )
  ).to.be.true;
  console.log("Rewards Locker deployment verified");

  expect(await staking.asset()).to.equal(lpTokenAddress);
  expect(await staking.governanceRegistry()).to.equal(
    governanceRegistry.address
  );
  expect(await staking.rewardsLocker()).to.equal(rewardsLocker.address);
  expect(
    await staking.hasRole(
      await staking.TEAM_MULTISIG(),
      foundationMultiSigAddress
    )
  ).to.be.true;
  console.log("Staking deployment verified");

  console.log("Deployment verified");
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
