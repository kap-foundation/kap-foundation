# Kapital DAO

The Kapital DAO is a play-to-earn blockchain gaming guild, which incentivizes participation through KAP token allocations. The value of KAP tokens is secured long-term by the Kapital DAO's use of gaming revenue to purchase KAP tokens in the open market.

## Phase 1 (Incentivization, first 52 weeks after deployment)

The following contracts will be deployed:

- Token.sol (the KAP token)
- Vesting.sol (KAP locking and linear vesting for team and private investors)
- Staking.sol (KAP-ETH Uniswap V2 LP staking pool)
- RewardsLocker.sol (locks claimed staking rewards before user withdrawal)
- Governance.sol (on-chain governance)
- GovernanceRegistry.sol (holds address of latest governance contract)
- (3x) GovernanceFund.sol (fund owned by governance; treasury, community incentives, revenue)
- (4x) MultisigFund.sol (fund owned by Gnosis Safe team multisig; future investors, IDO (initial DEX offering), DEX liquidity, CEX liquidity)

In the constructor of the KAP token contract, all KAP tokens will be minted to the deployer. At this point, KAP tokens have no value and hence this centralized power is not problematic. We only proceed to the IDO stage (where KAP tokens first gain value) if all concerned parties confirm that the following transfers are made, and the vesting agreements are owned as previously agreed:
- Governance funds:
    - 37% community incentives
    - 12.5% treasury
- 8% rewards locker (for Phase 1 rewards)
- 6.25% team multisig
- Team multisig funds:
    - 2.5% future investors
    - 2% IDO
    - 1.5% DEX liquidity
    - 1.5% CEX liquidity
- 28.75% vesting contract (in the form of vesting agreements created by contract deployer)

Users may purchase KAP tokens during the IDO. Those who choose to use these KAP tokens to mint and stake KAP-ETH LP tokens from the Uniswap v2 pool are rewarded with additional KAP tokens from the LP staking pool. During Phase 1, the staking rewards from the LP staking pool will have a base emission rate of 4% of the total KAP supply over 52 weeks. Users who boost their rewards via lock period extension can earn up to double their rewards. Therefore, the maximum KAP rewards emission rate is 8% of the KAP total supply over 52 weeks.

Users can claim their pending staking rewards on a continuous basis. The claim transaction creates a lock agreement in the rewards locker contract, in which the user can withdraw their claimed rewards 52 weeks after the transaction timestamp. The rewards for Phase 1 are sent to the rewards locker contract at deployment. For use in the event of an emergency where it is determined that users can (or will be able to) withdraw more than their fair share of KAP rewards, the governance and the team multisig are permitted to transfer KAP out of the rewards locker.

The initial deployment of the Kapital DAO on-chain governance queries voting weight from the vesting contract. In the future, additional voting weight sources could include staking pools and associated rewards lockers.

The primary functions of the governance are to control the governance funds and to set future staking rewards emission rates (see Phase 2). If the current governance contract becomes inadequate for future needs, the governance can update itself by changing the governance address in the governance registry.

For more specific details on the contracts in the Kapital DAO protocol, please refer to `./readmes`.

## Phase 2 (Distribution, second 52 weeks after deployment)

The LP staking contract permits the governance and team multisig to set a new KAP emission rate. It is suggested that this action is performed by the governance, whereas the team multisig only shares this privilege for special situations. When setting a new emission rate, the governance will typically also send the appropriate amount of KAP to the rewards locker (although, this transfer of KAP is not strictly required). We will propose that the governance creates rewards rules in such a way that KAP staking rewards match revenue earned by the gaming guild. During Phase 2, the KAP for these rewards rules will come from the community incentives governance fund, so that the actual gaming revenue can be used to scale the guild.

## Phase 3 (Buybacks, long-term)

Phase 3 attempts to create a sustainable future for the Kapital DAO. 50% of gaming revenue will be used to scale the guild, and the other 50% of gaming revenue will be used to buy KAP in the open market to secure the value of KAP tokens long-term. The KAP obtained though these buybacks will be held in the revenue governance fund until it is used for staking rewards. All remaining KAP in the community incentives governance fund will also be distributed during Phase 3. Therefore, the final steady-state of the Kapital DAO will be for the community incentives governance fund to be empty, and for the staking rewards (which are sent to the rewards locker) to always come from the revenue governance fund.

## Tests

### Install node modules

- `npm ci`

### Run tests

- `npx hardhat test`

### Test coverage

- `npx hardhat coverage`

## Deployment

- Create a file `./.env`, and fill in missing information from `./.env.example`
- Add a network to `./hardhat.config.js` together with a provider url and relevant private keys as described in the [Hardhat docs](https://hardhat.org/tutorial/deploying-to-a-live-network.html#_7-deploying-to-a-live-network).
- `npx hardhat run scripts/deploy.js --network <network-name>`
- `./hardhat.config.js` has examples (commented out) for the Ropsten and Rinkeby testnets. The localhost network accounts can be overriden if deploying on a locally forked network.
