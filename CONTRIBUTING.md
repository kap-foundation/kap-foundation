# Contributing to Kapital DAO Smart Contracts

As an open source project, we welcome contributions of many forms.

Examples of contributions include:

* Code patches
* Documentation improvements
* Bug reports and patch reviews

## Getting Started

### Install node modules

```
npm ci
```

### Run tests

```
npx hardhat test
```

GovernanceV2 tests require access to ETH mainnet via a node service. To pass these tests, please fill in the Infura API key in the the .env file. To skip these tests, please add .skip after the first describe in the file.

Please see the README for more information.
