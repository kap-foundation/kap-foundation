const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

let iface = new ethers.utils.Interface([
  "function testCallEther () payable",
]);

describe("Governance Periphery", function () {
  describe("GovernanceRegistry", function () {
    before(async function () {
      [deployer, ...addrs] = await ethers.getSigners();

      GovernanceTester = await ethers.getContractFactory("GovernanceTester");
      governor = await GovernanceTester.deploy()
      governor2 = await GovernanceTester.deploy()

      GovernanceRegistry = await ethers.getContractFactory("GovernanceRegistry");
      governanceRegistry = await GovernanceRegistry.deploy(governor.address);
    });
    describe("Deployment", () => {
      it("Should store correct governance address", async function () {
        expect(await governanceRegistry.governance()).to.equal(governor.address);
      });
      it("should revert if invalid governance address", async () => {
        await expect(
          GovernanceRegistry.deploy(ethers.constants.AddressZero)
        ).to.be.revertedWith("Zero address");
      });
    });
    it("Should be able to update governance", async function () {
      await governor.changeGovernance(governanceRegistry.address, governor2.address)
      await governor2.confirmChanged(governanceRegistry.address)
      expect(await governanceRegistry.governance()).to.equal(governor2.address);

      await governor2.changeGovernance(governanceRegistry.address, governor.address)
      await governor.confirmChanged(governanceRegistry.address)
      expect(await governanceRegistry.governance()).to.equal(governor.address);
    });
    it("Should revert if not governor", async function () {
      await expect(
        governanceRegistry.changeGovernance(deployer.address)
      ).to.be.revertedWith("Only governance");
      await expect(
        governor2.changeGovernance(governanceRegistry.address, governor.address)
      ).to.be.revertedWith("Only governance");
    });
    it("Should revert if new governance is invalid", async function () {
      await expect(
        governor.changeGovernance(governanceRegistry.address, ethers.constants.AddressZero)
      ).to.be.revertedWith("Invalid new governance");
      await expect(
        governor.changeGovernance(governanceRegistry.address, governor.address)
      ).to.be.revertedWith("Invalid new governance");
      await expect(
        governor.changeGovernance(governanceRegistry.address, deployer.address)
      ).to.be.reverted;
    });
    it("Should revert if trying to confirm changed from invalid account", async function () {
      await expect(
        governanceRegistry
          .confirmChanged()
      ).to.be.revertedWith("Invalid appointed");
      await governor.changeGovernance(governanceRegistry.address, governor2.address)
      await expect(
          governanceRegistry
            .confirmChanged()
        ).to.be.revertedWith("Only appointed");
    })
  });
  describe("GovernanceFund", function () {
    before(async function () {
      [deployer, governor, governor2, ...addrs] = await ethers.getSigners();

      GovernanceRegistry = await ethers.getContractFactory("GovernanceRegistry");
      governanceRegistry = await GovernanceRegistry.deploy(governor.address);

      GovernanceFund = await ethers.getContractFactory("GovernanceFund");
      governanceFund = await GovernanceFund.deploy(governanceRegistry.address);

      CallTester = await ethers.getContractFactory("CallTester");
      callTester = await CallTester.deploy();
    });
    describe("Deploy", () => {
      it("should assign correct registry", async () => {
        expect(await governanceFund.governanceRegistry()).to.equal(governanceRegistry.address);
      });
      it("should revert for invalid registry address", async () => {
        await expect(
          GovernanceFund.deploy(ethers.constants.AddressZero)
        ).to.be.revertedWith("Zero address");
      });
    });
    it("Should be able to receive ETH", async function () {
      let beforeBal = await deployer.getBalance();
      let val = ethers.utils.parseEther("1");
      let tx = {
        to: governanceFund.address,
        // Convert currency unit from ether to wei
        value: val,
      };
      // Send a transaction
      await deployer.sendTransaction(tx);
      let afterBal = await deployer.getBalance();
      expect(beforeBal > afterBal + val).to.be.true;
    });
    describe("Transact", function () {
      it("Should revert if msg.sender is not GovernanceRegistry", async function () {
        encoded = iface.encodeFunctionData("testCallEther", []);
        await expect(
          governanceFund.transact([callTester.address], [1], [encoded])
        ).to.be.revertedWith("Only governance");
      });
      it("Should revert if no targets provided", async function () {
        encoded = iface.encodeFunctionData("testCallEther", []);
        await expect(
          governanceFund.connect(governor).transact([], [1], [encoded])
        ).to.be.revertedWith("Invalid array length");
      });
      it("Should revert if values length doesn't match targets", async function () {
        encoded = iface.encodeFunctionData("testCallEther", []);
        await expect(
          governanceFund
            .connect(governor)
            .transact([callTester.address], [], [encoded])
        ).to.be.revertedWith("Array length mismatch");
      });
      it("Should revert if data length doesn't match targets", async function () {
        encoded = iface.encodeFunctionData("testCallEther", []);
        await expect(
          governanceFund
            .connect(governor)
            .transact([callTester.address], [1], [])
        ).to.be.revertedWith("Array length mismatch");
      });
      it("Should be able to Call targets", async function () {
        encoded = iface.encodeFunctionData("testCallEther", []);
        beforeBal = await callTester.getBal();
        await expect(
          governanceFund
            .connect(governor)
            .transact([callTester.address], [1], [encoded])
        ).to.not.be.reverted;
        expect(await callTester.getBal()).to.be.equal(beforeBal.add(1));
      });
    });
  });
  describe("CallTester", () => {
    before(async function () {
      [deployer, governor, governor2, ...addrs] = await ethers.getSigners();

      CallTester = await ethers.getContractFactory("CallTester");
      callTester = await CallTester.deploy();
    });
    describe("testCall", () => {
      it("Should revert when password incorrect", async () => {
        await expect(callTester.testCall(124)).to.be.revertedWith("Invalid pw");
      });
    });
    describe("testCallEther", () => {
      it("Should revert when value is 0", async () => {
        await expect(callTester.testCallEther()).to.be.revertedWith(
          "Payment not received"
        );
      });
    });
  });
});
