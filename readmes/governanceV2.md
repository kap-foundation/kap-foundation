# Governance

The primary function of the Kapital DAO governance is to control the funds belonging to the Kapital DAO via an on-chain voting mechanism. The main governance funds are the treasury, community incentives, and revenue funds. Any governance action will undergo a vote before it can be enacted. More information on the Kapital DAO governance structure can be found in the [KAP Docs](https://docs.kapital.gg/games-and-operations/treasury).

## Voting Weight

Voting weight is the measure of influence a certain member has within the Kapital DAO and is required for proposing and voting. A member's voting weight is directly calculated by how much KAP they own within valid sources. GovernanceV2 pulls voting weight from the KapVesting, Staking, and TimeLock contracts, with an option for the team multisig to toggle each. As the DAO matures, other sources can be added and removed via a DAO vote to upgrade the governance contract. Possible future sources include additional staking pools and the rewards locker.

KAP and liquidity (LP) tokens will be counted separately. UniswapV2 liquidity tokens represent a time-varying amount of KAP tokens and thus should only be converted during key events: proposition and execution.

## Proposals

Proposals will be in the form of a yes/no approval to call a contract (or series of contracts) provided by the proposing member. These contracts will take actions such as the following:

- Community Incentives pool disbursements
- Changing DAO parameters
- Burning tokens

Proposals/changes that require diverse voting options and other forms of flexibility not offered from this format should first undergo debate on community forums. This will help to reduce gas-costs and encourage communication and community involvement. Only the most promising options should be proposed on-chain for vote approval.

Members that wish to put forth a proposal must have a **minimum threshold** of voting weight. There is also a **proposal cooldown** parameter, that will limit how frequently each member can create proposals. The proposal cooldown is used to prevent a large number of spam proposals from an adversarial token holder which meets the proposal threshold. The requirement that vesting beneficiaries must `undelegate` for at least one voting period prior to changing their delegate prohibits the proposal origin address from changing rapidly and therefore validates the proposal cooldown scheme. If the DAO chooses to include voting from staking contracts, then we have a similar protection from the fact that tokens must be staked (with a fixed address) to vote.

## Voting

Each user (address) may only vote once per proposal during the designated voting window, and all votes are permanent. The weight of the vote is measured according to KAP token balance.

## Veto

The `Proposal` struct has a `vetoed` property which defaults to `false`. If the members of the team multisig wallet determine that a proposal is malicious, they can change `vetoed` to `true` which will prevent voting on and execution of that proposal. There is no option to un-veto, as this would interfere with the expected governance process. If it is determined that a proposal has been vetoed by mistake, the proposal can be resubmitted. As the DAO matures and voting power transfers from the team to the community, the team can renounce this veto power in favor of another method determined by the community.

## Execution

In order for a proposal to be executed, it has to meet all of the following requirements:

- **Not Vetoed**: A proposal can only be executed if it hasn't already been vetoed.
- **Not Executed**: A proposal can only be executed if it hasn't already been executed.
- **Successful**: The total yays KAP weight has to be greater than the nays KAP weight. A tie is treated as an unsuccessful proposal.
- **Execution Window**: The current block timestamp must fall within the start and end of the proposal's execution window.
- **Quorum**: A minimum amount of votes (yays and nays) is required before proposals can be passed. This will prevent proposals from being "sneaked" past and encourage community engagement.

If all the conditions have been met, then the proposal can be executed. This will take place through calls to the contracts specified in the proposal, passing along the specified calldata. Anyone can execute a successful proposal.

## LP-KAP Conversion

During **proposition**, the LP-KAP conversion will directly use the current Uniswap pool reserve ratios. This is because a time weighted average price (TWAP) requires a time duration (start and end) and thus cannot be calculated within one block. The conversion will be calculated using the following formula:

$$
\text{weightKAP} = \frac{\text{weightLP}}{\text{reserveLP}} \cdot \text{reserveKAP}
$$

During **execution**, the contract will use a TWAP to determine the amount of KAP in the reserves. This will make the conversion extremely resilient to attacks, as the attacker would have to provide significant capital and counter all attempts to arbitrage during the entire proposal period. The formula used is derived from two Automated Market Maker (AMM) primitives obtained from the [Uniswap Whitepaper](https://uniswap.org/whitepaper.pdf) and [Uniswap Pools Docs](https://docs.uniswap.org/protocol/V2/concepts/core-concepts/pools) respectively.

$$
\begin{split}
\text{priceA} &= \frac{\text{reserveB}}{\text{reserveA}}\\
k &= \text{reserveA} \cdot \text{reserveB}
\end{split}
$$

where k is the constant product (taking into account the accumulated fees). With some algebra, we arrive at

$$
\text{reserveKAP} = \sqrt{k \cdot \text{priceETH}}
$$

This can then be directly substituted into the formula used during proposition as follows:

$$
\begin{split}
\text{weightKAP} &= \frac{\text{weightLP}}{\text{totalSupplyLP}} \cdot \text{reserveKAP}\\
&= \frac{\text{weightLP}}{\text{totalSupplyLP}} \cdot \sqrt{k \cdot \text{priceETH}}
\end{split}
$$

priceETH (the TWAP) will be determined by comparing the pricecumulatives and timestamps during proposition and execution. More info can be found in the [Uniswap Docs](https://docs.uniswap.org/protocol/V2/concepts/core-concepts/oracles).

## Change governance

We predict that our original governance model will not be sufficient for the needs of the DAO for all time. Therefore, the DAO can vote to update the governance contract using the governance registry contract. This works because contracts that explicitly use information from the governance contract, such as the staking contracts, rewards locker, and vesting contract, do so by first querying the address of the latest governance contract from the governance registry. The mechanism for changing governance is a two step process. First, the DAO must appoint a new governance contract address by calling the `changeGovernance` function in the governance registry. Then, the newly appointed governance contract must confirm its appointment by calling `confirmChanged`. The confirmation step is a basic effort towards ensuring that the newly appointed governance contract is ready to accept the governance role.
