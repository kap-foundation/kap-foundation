const { expect } = require("chai");
const { ethers } = require("hardhat");

const day = 60 * 60 * 24;
const week = 60 * 60 * 24 * 7;
const ZeroAddress = ethers.constants.AddressZero;

const skip = async (time) => {
  await ethers.provider.send("evm_increaseTime", [time]);
  await ethers.provider.send("evm_mine");
};

describe("Contract: TimeLock", () => {
  beforeEach(async () => {
    [deployer, user] = await ethers.getSigners();

    Token = await ethers.getContractFactory("Token");
    TimeLock = await ethers.getContractFactory("TimeLock");
    GovernanceTester = await ethers.getContractFactory("GovernanceTester");
    GovernanceRegistry = await ethers.getContractFactory("GovernanceRegistry");

    token = await Token.deploy();
    governanceTester = await GovernanceTester.deploy();
    governanceRegistry = await GovernanceRegistry.deploy(
      governanceTester.address
    );
    timeLock = await TimeLock.deploy(token.address, governanceRegistry.address);

    token.transfer(user.address, ethers.utils.parseUnits("1000"));
  });

  describe("Deployment", () => {
    it("Should revert if asset address is zero", async () => {
      await expect(
        TimeLock.deploy(ZeroAddress, governanceRegistry.address)
      ).to.be.revertedWith("TimeLock: Zero address");
    });
    it("Should revert if governance registry address is zero", async () => {
      await expect(
        TimeLock.deploy(token.address, ZeroAddress)
      ).to.be.revertedWith("TimeLock: Zero address");
    });
    it("Should assign correct addresses", async () => {
      expect(await timeLock.asset()).to.equal(token.address);
      expect(await timeLock.governanceRegistry()).to.equal(
        governanceRegistry.address
      );
      expect(await timeLock.lockPeriod()).to.equal(2 * week);
    });
  });

  describe("Lock", () => {
    it("Should revert if locking zero asset", async () => {
      await expect(timeLock.lock(0)).to.be.revertedWith(
        "TimeLock: zero amount"
      );
    });
    it("Should lock asset if valid amount", async () => {
      await token
        .connect(user)
        .approve(timeLock.address, ethers.utils.parseUnits("1000"));
      await timeLock.connect(user).lock(ethers.utils.parseUnits("100"));
      expect(await token.balanceOf(user.address)).to.equal(
        ethers.utils.parseUnits("900")
      );
      expect(await timeLock.totalLocked(user.address)).to.equal(
        ethers.utils.parseUnits("100")
      );
    });
    it("Should return zero weight before voting period is over", async () => {
      await token
        .connect(user)
        .approve(timeLock.address, ethers.utils.parseUnits("1000"));
      await timeLock.connect(user).lock(ethers.utils.parseUnits("100"));

      expect(await timeLock.votingWeight(user.address)).to.equal(0);
      await expect(
        timeLock.connect(user).appointDelegate(user.address)
      ).to.be.revertedWith("Delegator: delegate cooldown");
      await skip(2 * day);
      await expect(
        timeLock.connect(user).appointDelegate(user.address)
      ).to.be.revertedWith("Delegator: delegate cooldown");
      await skip(1 * day + 1);
      expect(await timeLock.votingWeight(user.address)).to.equal(0);

      // delegate to himself
      await timeLock.connect(user).appointDelegate(user.address);
      expect(await timeLock.votingWeight(user.address)).to.equal(
        ethers.utils.parseUnits("100")
      );
      expect(await timeLock.delegates(user.address)).to.equal(user.address);

      await timeLock.connect(user).lock(ethers.utils.parseUnits("10"));
      expect(await timeLock.delegates(user.address)).to.equal(ZeroAddress);
      expect(await timeLock.votingWeight(user.address)).to.equal(0);
      await skip(3 * day + 1);

      expect(await timeLock.votingWeight(user.address)).to.equal(0);
      // delegate to himself again
      await timeLock.connect(user).appointDelegate(user.address);
      expect(await timeLock.votingWeight(user.address)).to.equal(
        ethers.utils.parseUnits("110")
      );
    });
  });

  describe("Unlock", () => {
    beforeEach(async () => {
      await token
        .connect(user)
        .approve(timeLock.address, ethers.utils.parseUnits("1000"));
      await timeLock.connect(user).lock(ethers.utils.parseUnits("100"));
    });
    it("Should revert if unlocking before lock period is over", async () => {
      await expect(timeLock.connect(user).unlock(0)).to.be.revertedWith(
        "TimeLock: early collect"
      );
    });
    it("Should unlock asset after lock period is over", async () => {
      expect(await token.balanceOf(user.address)).to.equal(
        ethers.utils.parseUnits("900")
      );
      await skip(2 * week);
      await timeLock.connect(user).unlock(0);
      expect(await token.balanceOf(user.address)).to.equal(
        ethers.utils.parseUnits("1000")
      );
      expect(await timeLock.votingWeight(user.address)).to.equal(0);
    });
    it("Should revert if unlocking again", async () => {
      await skip(2 * week);
      await timeLock.connect(user).unlock(0);
      await expect(timeLock.connect(user).unlock(0)).to.be.revertedWith(
        "TimeLock: already collected"
      );
    });
    it("Should undelegate automatically", async () => {
      await skip(3 * day);
      await timeLock.connect(user).appointDelegate(user.address);
      expect(await timeLock.votingWeight(user.address)).to.equal(
        ethers.utils.parseUnits("100")
      );
      expect(await timeLock.delegates(user.address)).to.equal(user.address);
      await skip(11 * day);
      await timeLock.connect(user).unlock(0);

      expect(await timeLock.delegates(user.address)).to.equal(ZeroAddress);
      expect(await timeLock.votingWeight(user.address)).to.equal(0);
    });
  });

  describe("Delegate", () => {
    beforeEach(async () => {
      await token
        .connect(user)
        .approve(timeLock.address, ethers.utils.parseUnits("1000"));
    });

    describe("AppointDelegate", () => {
      it("Should revert if locked amount is zero", async () => {
        await expect(
          timeLock.connect(user).appointDelegate(deployer.address)
        ).to.be.revertedWith("Delegator: zero balance");
      });

      it("Should revert if delegating to zero address", async () => {
        await expect(
          timeLock.connect(user).appointDelegate(ZeroAddress)
        ).to.be.revertedWith("Delegator: Zero address");
      });

      it("Should revert before cooldown expired of new lock", async () => {
        await timeLock.connect(user).lock(ethers.utils.parseUnits("100"));
        await expect(
          timeLock.connect(user).appointDelegate(deployer.address)
        ).to.be.revertedWith("Delegator: delegate cooldown");
        await skip(2 * day);
        await expect(
          timeLock.connect(user).appointDelegate(deployer.address)
        ).to.be.revertedWith("Delegator: delegate cooldown");
        await skip(1 * day - 10);
        await expect(
          timeLock.connect(user).appointDelegate(deployer.address)
        ).to.be.revertedWith("Delegator: delegate cooldown");
        await skip(10);

        await timeLock.connect(user).appointDelegate(deployer.address);
        expect(await timeLock.votingWeight(user.address)).to.equal(0);
        expect(await timeLock.votingWeight(deployer.address)).to.equal(
          ethers.utils.parseUnits("100")
        );
      });

      it("Should revert if trying again without undelegate", async () => {
        await timeLock.connect(user).lock(ethers.utils.parseUnits("100"));
        await skip(3 * day);
        await timeLock.connect(user).appointDelegate(user.address);
        expect(await timeLock.votingWeight(user.address)).to.equal(
          ethers.utils.parseUnits("100")
        );

        await expect(
          timeLock.connect(user).appointDelegate(deployer.address)
        ).to.be.revertedWith("Delegator: Must undelegate first");
      });

      it("Should revert before cooldown expired of undelegate", async () => {
        await timeLock.connect(user).lock(ethers.utils.parseUnits("100"));
        await skip(3 * day);
        expect(await timeLock.votingWeight(user.address)).to.equal(0);
        await timeLock.connect(user).appointDelegate(user.address);
        expect(await timeLock.votingWeight(user.address)).to.equal(
          ethers.utils.parseUnits("100")
        );
        await timeLock.connect(user).undelegate();
        expect(await timeLock.votingWeight(user.address)).to.equal(0);

        await expect(
          timeLock.connect(user).appointDelegate(deployer.address)
        ).to.be.revertedWith("Delegator: delegate cooldown");
        await skip(3 * day - 10);
        await expect(
          timeLock.connect(user).appointDelegate(deployer.address)
        ).to.be.revertedWith("Delegator: delegate cooldown");
        await skip(10);
        await timeLock.connect(user).appointDelegate(deployer.address);

        expect(await timeLock.votingWeight(user.address)).to.equal(0);
        expect(await timeLock.votingWeight(deployer.address)).to.equal(
          ethers.utils.parseUnits("100")
        );
      });
    });

    describe("Undelegate", () => {
      beforeEach(async () => {
        await token
          .connect(user)
          .approve(timeLock.address, ethers.utils.parseUnits("1000"));
      });

      it("Should revert before appointDelegate", async () => {
        await expect(timeLock.connect(user).undelegate()).to.be.revertedWith(
          "Delegator: Delegate already zero"
        );

        await timeLock.connect(user).lock(ethers.utils.parseUnits("100"));
        await expect(timeLock.connect(user).undelegate()).to.be.revertedWith(
          "Delegator: Delegate already zero"
        );

        await skip(3 * day);
        await timeLock.connect(user).appointDelegate(user.address);
        await timeLock.connect(user).undelegate();
      });
    });
  });

  describe("Lock period", () => {
    it("Should be changed only by the governance", async () => {
      await expect(timeLock.updateLockPeriod(0)).to.be.revertedWith(
        "TimeLock: invalid lock period"
      );
      await expect(timeLock.updateLockPeriod(3 * week)).to.be.revertedWith(
        "TimeLock: Only governance"
      );
      await governanceTester.changeTimeLockPeriod(timeLock.address, 3 * week);
      expect(await timeLock.lockPeriod()).to.equal(3 * week);
    });
  });
});
