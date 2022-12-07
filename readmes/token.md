# Token

The KAP token contract is based on OpenZeppelin's [implementation](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol) of the ERC20 interface.

In the constructor, we mint 1 billion KAP tokens (plus 18 zeros). The total supply of KAP tokens cannot increase, since there is no minting capability outside the constructor. However, we add an external burn function which allows any holder of KAP tokens to permanently dispose of any number of KAP tokens in their possession. The effect of burning reduces both the token holder's wallet balance and the total KAP supply by the amount burned. The main purpose of the burn function is to be used by the Kapital DAO itself, to slowly burn excess KAP tokens over time, therefore putting deflationary pressure on the value of KAP token ownership.
