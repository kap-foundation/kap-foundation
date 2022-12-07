/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("hardhat-contract-sizer");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.9",
  },
  gasReporter: {
    currency: "USD",
    gasPrice: 40,
    coinmarketcap: process.env.COINMARKETCAP_API,
    excludeContracts: ["dao-contracts-c660d7e/", "testers/"],
  },
  networks: {
    // mainnet: {
    //   url: "https://mainnet.infura.io/v3/" + process.env.INFURA_ID,
    //   accounts: [process.env.MAINNET_DEPLOYER_PRIVATE_KEY],
    // },
    // ropsten: {
    //   url: "https://ropsten.infura.io/v3/" + process.env.INFURA_ID,
    //   accounts: [process.env.DEPLOYER_PRIVATE_KEY],
    // },
    // rinkeby: {
    //   url: "https://rinkeby.infura.io/v3/" + process.env.INFURA_ID,
    //   accounts: [process.env.DEPLOYER_PRIVATE_KEY],
    // },
    // mainnet: {
    //   url: "https://mainnet.infura.io/v3/" + process.env.INFURA_ID,
    //   accounts: [process.env.DEPLOYER_PRIVATE_KEY],
    // },
    // localhost: {
    //   accounts: [process.env.DEPLOYER_PRIVATE_KEY]
    // }
  },
  // etherscan: {
  //   apiKey: process.env.ETHERSCAN_API_KEY
  // }
};
