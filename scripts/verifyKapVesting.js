// `npx hardhat run scripts/verifyKapVesting.js --network rinkeby`

async function main() {
    const vestingAddress = "0xF4ff2F51d721Cc62201D81dab4B5EEcB3d692a99";
    const teamMultisig = "0x4731E90300FF77f0b414A651a2626A25286fA13B";
    const foundationMultisig = "0xbc450C9EcED158c6bD1AFfA8D37153E278e63e68";  
    const kapToken = "0x9625cE7753ace1fa1865A47aAe2c5C2Ce4418569";  

    await run("verify:verify", {
        address: vestingAddress,
        contract: "contracts/KapVesting.sol:KapVesting",
        constructorArguments: [
            teamMultisig,
            foundationMultisig,
            kapToken
        ]
    });
}

main();
