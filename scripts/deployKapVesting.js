require("dotenv").config();
const { ethers } = require("hardhat");
const { expect } = require("chai");

async function main() {
  const teamMultisig = "0x4731E90300FF77f0b414A651a2626A25286fA13B";
  const foundationMultisig = "0xbc450C9EcED158c6bD1AFfA8D37153E278e63e68";  
  const kapToken = "0x9625cE7753ace1fa1865A47aAe2c5C2Ce4418569";

  const Vesting = await ethers.getContractFactory("KapVesting");
  const vesting = await Vesting.deploy(
    teamMultisig,
    foundationMultisig,
    kapToken
  );
  await vesting.deployed();
  expect(await vesting.kapToken()).to.equal(kapToken);

  VESTING_CREATOR = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("VESTING_CREATOR")
  );
  REGISTRY_SETTER = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("REGISTRY_SETTER")
  );

  expect(await vesting.getRoleMemberCount(VESTING_CREATOR)).to.equal(2);
  expect(await vesting.hasRole(VESTING_CREATOR, teamMultisig)).to.be.true;
  expect(await vesting.hasRole(VESTING_CREATOR, foundationMultisig)).to.be.true;

  expect(await vesting.getRoleMemberCount(REGISTRY_SETTER)).to.equal(1);
  expect(await vesting.hasRole(REGISTRY_SETTER, foundationMultisig)).to.be.true;
  console.log("Vesting contract deployed at:", vesting.address);
}

main();
