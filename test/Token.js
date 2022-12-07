const { expect } = require("chai");
const { BigNumber } = require("ethers");

describe("Contract: Token", () => {
  beforeEach(async () => {
    Token = await ethers.getContractFactory("Token");
    [deployer, _] = await ethers.getSigners();
    token = await Token.deploy();
  });

  describe("Deployment", () => {
    it("Name should be Kapital DAO Token", async () => {
      expect(await token.name()).to.equal("Kapital DAO Token");
    });
    it("Symbol should be KAP", async () => {
      expect(await token.symbol()).to.equal("KAP");
    });
    it("Should mint 1 billion KAP with 18 decimals", async () => {
      oneBillion = BigNumber.from('1000000000');
      expect(oneBillion).to.equal(10 ** 9);
      decimals = BigNumber.from(18);
      expect(await token.totalSupply()).to.equal(
        oneBillion.mul(BigNumber.from(10).pow(decimals))
      );
      expect(await token.totalSupply()).to.equal(
        '1000000000000000000000000000'
      );
    });
    it("Deployer should have total supply", async () => {
      expect(await token.totalSupply()).to.equal(
        await token.balanceOf(deployer.address)
      );
    });
  });
});
