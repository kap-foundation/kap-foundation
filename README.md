# KAP Games

The KAP Foundation powers $KAP, an ERC-20 utility token empowering modern crypto games in partnership with KAP Games.

[Official site](https://kap.foundation/)

## Tests

### Install node modules

`npm ci`

### Run tests

`npx hardhat test`

GovernanceV2 tests require access to ETH mainnet via a node service. To pass these tests, please fill in the Infura API key in the the `.env` file. To skip these tests, please add `.skip` after the first `describe` in the file.

### Test coverage

`npx hardhat coverage`

## Deployment

- Create a file `./.env`, and fill in missing information from `./.env.example`
- Add a network to `./hardhat.config.js` together with a provider url and relevant private keys as described in the [Hardhat docs](https://hardhat.org/tutorial/deploying-to-a-live-network.html#_7-deploying-to-a-live-network).
- `npx hardhat run scripts/deploy.js --network <network-name>`
- `./hardhat.config.js` has examples (commented out) for the Ropsten and Rinkeby testnets. The localhost network accounts can be overriden if deploying on a locally forked network.
