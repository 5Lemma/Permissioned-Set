// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.19;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "./lib/EIP712.sol";

error InvalidSignature();

// TODO: natspec
contract PermissionedSet is EIP712, Ownable {
    /// A constant hash of the claim operation's signature.
    // same typehash for wrappping and unwrapping
    // all we need in the signature is address, and optionally an array of people to whitelist storage
    // update.  And an array to remove.
    bytes32 public constant PERMISSION_TYPEHASH =
        keccak256(
            "permission(address _caller,address[] _whitelist,address[] _blacklist)"
        );

    /// The name of the permission set
    string public permissionedSetName;

    /// The address permitted to sign claim signatures.
    address public immutable signer;

    /// A mapping for whitelisted accounts
    mapping(address => bool) public whitelist;

    event WhitelistSet(
        address indexed caller,
        address[] whitelist,
        address[] blacklist
    );

    constructor(
        string memory _permissionedSetName,
        address _signer
    ) EIP712(_permissionedSetName, "1") {
        permissionedSetName = _permissionedSetName;
        signer = _signer;
    }

    function _validatePermission(
        address _caller,
        address[] calldata _whitelist,
        address[] calldata _blacklist,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) private view returns (bool) {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        PERMISSION_TYPEHASH,
                        _caller,
                        _whitelist,
                        _blacklist
                    )
                )
            )
        );

        // The claim is validated if it was signed by our authorized signer.
        return ecrecover(digest, _v, _r, _s) == signer;
    }

    // called externally when owner has to update whitelist or blacklist
    function set(
        address[] calldata _whitelist,
        address[] calldata _blacklist
    ) external onlyOwner {
        // add everyone on _whitelist to whitelist
        for (uint i = 0; i < _whitelist.length; i++) {
            whitelist[_whitelist[i]] = true;
        }

        // remove everyone on _blacklist from whitelist
        for (uint i = 0; i < _blacklist.length; i++) {
            whitelist[_blacklist[i]] = false;
        }

        emit WhitelistSet(msg.sender, _whitelist, _blacklist);
    }

    // called when a user wraps or unwraps
    function delegatedSet(
        address[] calldata _whitelist,
        address[] calldata _blacklist,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) public {
        // Validiate that the permission was provided by our trusted `signer`.
        bool validSignature = _validatePermission(
            msg.sender,
            _whitelist,
            _blacklist,
            _v,
            _r,
            _s
        );
        if (!validSignature) {
            revert InvalidSignature();
        }

        // add everyone on _whitelist to whitelist
        for (uint256 i = 0; i < _whitelist.length; i++) {
            whitelist[_whitelist[i]] = true;
        }

        // remove everyone on _blacklist from whitelist
        for (uint256 i = 0; i < _blacklist.length; i++) {
            whitelist[_blacklist[i]] = false;
        }

        emit WhitelistSet(msg.sender, _whitelist, _blacklist);
    }
}
