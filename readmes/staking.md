# Staking

At the initial deployment of the Kapital DAO, there will be a staking contract where users can stake Uniswap v2 KAP-ETH LP tokens in return for KAP token rewards. The rewards a user accumulates are proportional to both the amount of LP tokens staked as well as the duration over which the user chooses to lock their LP tokens.

## Staking rewards

KAP rewards will be passively disbursed to stakers according to a specified emission rate (KAP per second). The initial emission rate will be 4% of the total KAP supply divided by 52 weeks. Beyond the initial 52 weeks, new emission rates will have to be set through the DAO process. Long-term, the rewards will be replenished using KAP purchased with gaming revenue. This KAP will be stored in the revenue governance fund, and distributed to the rewards locker contract as needed according to new emission rates.

When a user stakes they must choose a period of time, called the lock period, during which they cannot withdraw their staked LP tokens. The user is assigned a stake weight, which is the product of the lock period and the LP amount staked. The user then receives rewards based on the current emission rate and the fraction of the user's stake weight among the sum of all users' stake weights.

As a user accumulates rewards, these rewards are considered *pending* until the user claims them. When a user chooses to claim their rewards, the rewards are made available to the user in the rewards locker contract 52 weeks after the claim transaction. Thus, the governance contract does not send KAP to the staking pool. The governance contract instead sends KAP to the rewards locker contract, and users are able to withdraw this KAP based on the lock agreements created by the staking pools.

## Boost rewards

When users claim their rewards, they are given the option to *boost* their rewards by extending their existing lock period. By extending the lock period of their staking agreement, they can get up to a 2x multiplier on their claim amount. The boosted amount (that will be added to their pending rewards) is calculated by the following formula:

$$
\text{boostRewards} = 
            \text{pendingRewards} \cdot
            \frac{\text{remainingLockPeriod}}{\text{currentLockPeriod}} \cdot
            \frac{\text{lockExtension}}{\text{maxLockExtension}}
$$

Only staking agreements that are still active (lock period is not yet over) can obtain boosted rewards.

## Voting weight

The initial version of the governance contract only allows voting from the vesting contract. However, the DAO may later choose to use the LP staking pool as a source of voting weight. For this reason, the LP staking pool tracks the total LP amount staked for each user. When reporting this total amount, the staking pool will return `0` in the case that the user has increased their stake within a governance voting period. This returning of `0` is used to prevent a user from unstaking and then immediately staking again in order to double-vote on a single proposal.

If LP tokens are used towards voting weight, then special care must be taken in the governance contract to safely convert LP tokens to a corresponding KAP amount.
