'use strict';

// Imports.
import { ethers, network } from 'hardhat';
import { expect, should } from 'chai';

// Test the multi-asset vault.
describe('SignaturePermissionedSet', function () {
    let alice, bob, carol, dev;
    let TestERC721, SignaturePermissionedSet;
    before(async () => {
        const signers = await ethers.getSigners();
        const addresses = await Promise.all(signers.map(async signer => signer.getAddress()));
        alice = { provider: signers[0].provider, signer: signers[0], address: addresses[0] };
        bob = { provider: signers[1].provider, signer: signers[1], address: addresses[1] };
        carol = { provider: signers[2].provider, signer: signers[2], address: addresses[2] };
        dev = { provider: signers[3].provider, signer: signers[3], address: addresses[3] };

        // Create factories for deploying all required contracts using signers.
        // TestERC721 = await ethers.getContractFactory('TestERC721');
        SignaturePermissionedSet = await ethers.getContractFactory('PermissionedSet');
    });

    // Deploy a fresh set of smart contracts for testing with.
    let signaturePermissionedSet;
    beforeEach(async () => {
        // Deploy a mintable testing ERC-721 token.
        // test721 = await TestERC721.connect(dev.signer).deploy();

        // Deploy the signature claim contract.
        signaturePermissionedSet = await SignaturePermissionedSet.connect(dev.signer).deploy('Wedding', carol.address);
    });

    describe('testing the signature permissioned set', function () {
        // test that an address gets added to whitelist
        it('adds one address to whitelist', async () => {
            const whitelist = [alice.address];
            const blacklist = [];

            const domain = {
                name: 'Wedding',
                version: '1',
                chainId: network.config.chainId,
                verifyingContract: signaturePermissionedSet.address
            };

            let signature = await carol.signer._signTypedData(
                domain,
                {
                    permission: [
                        { name: '_caller', type: 'address' },
                        { name: '_whitelist', type: 'address[]' },
                        { name: '_blacklist', type: 'address[]' }
                    ]
                },
                {
                    '_caller': carol.address,
                    '_whitelist': whitelist,
                    '_blacklist': blacklist,
                }
            );

            let { v, r, s } = ethers.utils.splitSignature(signature);

            let initialWhitelist = signaturePermissionedSet.whitelist();
            initialWhitelist.should.have.lengthOf(0);

            await signaturePermissionedSet.connect(carol.signer).delegatedSet(
                whitelist,
                blacklist,
                v, r, s
            );

            // assset that alice is now in the whitelist
            let newWhitelist = signaturePermissionedSet.whitelist();
            newWhitelist.should.have.lengthOf(1);

            newWhitelist[0].should.equal(alice.address);

        });
        // test that an address gets removed from whitelist
    });

});