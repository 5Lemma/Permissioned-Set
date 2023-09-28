// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.19;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {PermissionedSet} from "./PermissionedSet.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// TODO: natspec
contract PermissionedToken is PermissionedSet, ReentrancyGuard, ERC20 {
    using SafeERC20 for IERC20;

    error NotWhitelisted();
    error InvalidInterestRate();

    // ERC-20 usdc
    IERC20 public immutable usdc;

    // interest rate to set by owner
    // interest rate scaled by 1e18
    // ex: interest rate of 0.055 (5.5%) is 55_000_000_000_000_000
    uint public interestRateMantissa;

    event NewInterestRateMantissa(
        address indexed caller,
        uint256 indexed newInterestRateMantissa
    );

    event Wrapped(
        address indexed caller,
        uint256 indexed usdcAmountIn,
        uint256 indexed tokenAmountOut
    );

    event Unwrapped(
        address indexed caller,
        uint256 indexed tokenAmountIn,
        uint256 indexed usdcAmountOut
    );

    constructor(
        uint _initialInterestRateMantissa,
        address _usdc,
        string memory _tokenName,
        string memory _tokenSymbol,
        string memory _permissionedSetName,
        address _signer
    )
        PermissionedSet(_permissionedSetName, _signer)
        ERC20(_tokenName, _tokenSymbol)
    {
        if (_initialInterestRateMantissa <= 0) {
            revert InvalidInterestRate();
        }
        interestRateMantissa = _initialInterestRateMantissa;
        usdc = IERC20(_usdc);
    }

    function wrap(
        uint64 _usdcAmount,
        address[] calldata _whitelist,
        address[] calldata _blacklist,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external nonReentrant {
        delegatedSet(_whitelist, _blacklist, _v, _r, _s);

        if (!whitelist[msg.sender]) {
            revert NotWhitelisted();
        }

        // transfer in _usdcAmount of usdc
        usdc.safeTransferFrom(msg.sender, address(this), _usdcAmount);

        // TODO: verify math
        //
        // tokenMintAmount = _usdcAmount * (1-interestRate)
        // ex: usdcAmount = 100, interestRate = 0.05 (5%)
        // tokenMintAmount = 100 * 0.95 = 95

        // TODO: do we lose precision by dividing by 1e18??  What if interest rate is 5.5%?  then tokenMintAmount = 100 * 0.945 = 94.5
        // or maybe it's okay because values are stored as wei?
        // I'm almost certain the math is off because of precision decimals

        uint256 tokenMintAmount = (_usdcAmount *
            1e18 *
            (1e18 - interestRateMantissa)) / 1e18;

        // mint tokens to caller
        _mint(msg.sender, tokenMintAmount);

        emit Wrapped(msg.sender, _usdcAmount, tokenMintAmount);
    }

    function unwrap(
        uint256 _tokenAmount,
        address[] calldata _whitelist,
        address[] calldata _blacklist,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external nonReentrant {
        delegatedSet(_whitelist, _blacklist, _v, _r, _s);

        if (!whitelist[msg.sender]) {
            revert NotWhitelisted();
        }

        // burn tokens
        _burn(msg.sender, _tokenAmount);

        // TODO: verify math
        //
        // usdcAmount = _tokenAmount * (1 + interestRate)
        // ex: _tokenAmount = 100, interestRate = 0.05 (5%)
        // usdcAmount = 100 * 1.05 = 105
        // I'm almost certain the math is off because of precision decimals
        uint256 usdcAmount = (_tokenAmount *
            1e18 *
            (1e18 + interestRateMantissa)) / 1e18;

        // transfer out USDC
        usdc.safeTransfer(msg.sender, usdcAmount);

        emit Unwrapped(msg.sender, _tokenAmount, usdcAmount);
    }

    // is this the right way to override ERC20 transfer?
    function transfer(
        address _to,
        uint256 _amount
    ) public virtual override returns (bool) {
        // Do I need to check if msg.sender is on the whitelist?
        // If they have a token balance they must already be on the whitelist I think
        if (!whitelist[_to]) {
            revert NotWhitelisted();
        }
        return ERC20.transfer(_to, _amount);
    }

    function transferFrom(
        address _from,
        address _to,
        uint256 _amount
    ) public virtual override returns (bool) {
        // Do I need to check if msg.sender is on the whitelist?
        // If they have a token balance they must already be on the whitelist I think
        if (!whitelist[_to]) {
            revert NotWhitelisted();
        }
        return ERC20.transferFrom(_from, _to, _amount);
    }

    function setInterestRateMantissa(
        uint _interestRateMantissa
    ) external onlyOwner {
        if (_interestRateMantissa <= 0) {
            revert InvalidInterestRate();
        }
        interestRateMantissa = _interestRateMantissa;

        emit NewInterestRateMantissa(msg.sender, _interestRateMantissa);
    }
}
