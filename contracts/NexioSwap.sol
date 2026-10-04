// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

interface IAchswapV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB);
}

interface IAchswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IAchswapV2Pair {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice USDC/EURC swaps and liquidity through Achswap V2.
///         Both tokens are 6-decimal ERC-20s. Native value paths are not used.
contract NexioSwap {
    IERC20 public immutable usdc;
    IERC20 public immutable eurc;
    IAchswapV2Router public immutable router;
    IAchswapV2Factory public immutable factory;

    uint256 private locked;

    modifier nonReentrant() {
        require(locked == 0, "Reentrant");
        locked = 1;
        _;
        locked = 0;
    }

    constructor(address _usdc, address _eurc, address _router, address _factory) {
        require(
            _usdc != address(0) && _eurc != address(0) && _router != address(0) && _factory != address(0),
            "Zero address"
        );
        usdc = IERC20(_usdc);
        eurc = IERC20(_eurc);
        router = IAchswapV2Router(_router);
        factory = IAchswapV2Factory(_factory);
    }

    function swapUSDCforEURC(uint256 amountIn, uint256 amountOutMin, uint256 deadline)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "Amount must be > 0");
        require(deadline >= block.timestamp, "Expired");

        _pull(usdc, amountIn);
        _approve(usdc, amountIn);

        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(eurc);
        uint256[] memory amounts = router.swapExactTokensForTokens(amountIn, amountOutMin, path, msg.sender, deadline);
        _clear(usdc);
        return amounts[amounts.length - 1];
    }

    function swapEURCforUSDC(uint256 amountIn, uint256 amountOutMin, uint256 deadline)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "Amount must be > 0");
        require(deadline >= block.timestamp, "Expired");

        _pull(eurc, amountIn);
        _approve(eurc, amountIn);

        address[] memory path = new address[](2);
        path[0] = address(eurc);
        path[1] = address(usdc);
        uint256[] memory amounts = router.swapExactTokensForTokens(amountIn, amountOutMin, path, msg.sender, deadline);
        _clear(eurc);
        return amounts[amounts.length - 1];
    }

    function addLiquidity(
        uint256 amountUsdcDesired,
        uint256 amountEurcDesired,
        uint256 amountUsdcMin,
        uint256 amountEurcMin,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountUsdc, uint256 amountEurc, uint256 liquidity) {
        require(amountUsdcDesired > 0 && amountEurcDesired > 0, "Amount must be > 0");
        require(deadline >= block.timestamp, "Expired");

        uint256 usdcBefore = usdc.balanceOf(address(this));
        uint256 eurcBefore = eurc.balanceOf(address(this));
        _pull(usdc, amountUsdcDesired);
        _pull(eurc, amountEurcDesired);
        _approve(usdc, amountUsdcDesired);
        _approve(eurc, amountEurcDesired);

        (amountUsdc, amountEurc, liquidity) = router.addLiquidity(
            address(usdc),
            address(eurc),
            amountUsdcDesired,
            amountEurcDesired,
            amountUsdcMin,
            amountEurcMin,
            msg.sender,
            deadline
        );

        _refund(usdc, usdcBefore);
        _refund(eurc, eurcBefore);
        _clear(usdc);
        _clear(eurc);
    }

    function removeLiquidity(
        uint256 liquidity,
        uint256 amountUsdcMin,
        uint256 amountEurcMin,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountUsdc, uint256 amountEurc) {
        require(liquidity > 0, "Amount must be > 0");
        require(deadline >= block.timestamp, "Expired");

        address pair = factory.getPair(address(usdc), address(eurc));
        require(pair != address(0), "Pair not found");

        IAchswapV2Pair pairToken = IAchswapV2Pair(pair);
        require(pairToken.transferFrom(msg.sender, address(this), liquidity), "LP transfer failed");
        require(pairToken.approve(address(router), liquidity), "LP approve failed");

        (amountUsdc, amountEurc) = router.removeLiquidity(
            address(usdc),
            address(eurc),
            liquidity,
            amountUsdcMin,
            amountEurcMin,
            msg.sender,
            deadline
        );

        require(pairToken.approve(address(router), 0), "LP approve reset failed");
    }

    function _pull(IERC20 token, uint256 amount) internal {
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }

    function _approve(IERC20 token, uint256 amount) internal {
        uint256 current = token.allowance(address(this), address(router));
        if (current > 0) {
            require(token.approve(address(router), 0), "Approve reset failed");
        }
        require(token.approve(address(router), amount), "Approve failed");
    }

    function _clear(IERC20 token) internal {
        if (token.allowance(address(this), address(router)) > 0) {
            require(token.approve(address(router), 0), "Approve reset failed");
        }
    }

    function _refund(IERC20 token, uint256 balanceBefore) internal {
        uint256 balanceNow = token.balanceOf(address(this));
        if (balanceNow > balanceBefore) {
            require(token.transfer(msg.sender, balanceNow - balanceBefore), "Refund failed");
        }
    }
}
