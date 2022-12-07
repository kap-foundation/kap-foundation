const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

let iface = new ethers.utils.Interface(["function testCallEther () payable"]);

describe("MultisigFund", function () {
  before(async function () {
    [deployer, multisig, ...addrs] = await ethers.getSigners();

    MultisigFund = await ethers.getContractFactory("MultisigFund");
    multisigFund = await MultisigFund.deploy(multisig.address);

    CallTester = await ethers.getContractFactory("CallTester");
    callTester = await CallTester.deploy();
  });
  describe("Deployment", () => {
    it("Should store the correct multisig", async function () {
      expect(await multisigFund.multisig()).to.equal(multisig.address);
    });
    it("should revert for invalid multisig", async () => {
      await expect(
        MultisigFund.deploy(ethers.constants.AddressZero)
      ).to.be.revertedWith("Zero address");
    });
  });
  describe("Transact", function () {
    it("Should revert if not multisig", async function () {
      await expect(multisigFund.transact([], [], [])).to.be.revertedWith(
        "Only multisig"
      );
    });
    it("Should successfuly transact", async function () {
      encoded = iface.encodeFunctionData("testCallEther", []);
      beforeBal = await callTester.getBal();
      overrides = { value: 1 };
      await expect(
        multisigFund
          .connect(multisig)
          .transact([callTester.address], [1], [encoded], overrides)
      ).to.not.be.reverted;
      expect(await callTester.getBal()).to.be.equal(beforeBal.add(1));
    });
  });
});
