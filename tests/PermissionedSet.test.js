const { expect } = require("chai");
const { ethers } = require("hardhat");
require("@nomicfoundation/hardhat-chai-matchers")

//let provider = ethers.getDefaultProvider();


describe("Exchange contract", function () {
    let addr1, addr2;

    // for holding factories
    let myTokenF, exchangeF;

    // for holding contracts
    let myToken, exchange;

    before(async function () {
        // get the artifacts for both contracts and create contract factories
        myTokenF = await ethers.getContractFactory("MyToken");
        exchangeF = await ethers.getContractFactory("MockExchange");
    });

    beforeEach(async function () {
        // deploy testing token
        myToken = await myTokenF.deploy();
        await myToken.deployed();

        // deploy exchange
        exchange = await exchangeF.deploy(myToken.address);
        await exchange.deployed();

        [addr1, addr2] = await ethers.getSigners();
        // console.log("Eth balance according to contract: %s", await exchange.myEtherBalance());
        // console.log("Eth balance according to ethers:   %s", await provider.getBalance(addr1.address));

        await myToken.connect(addr2).mintMe(BigInt(200e18));
    });

    describe("Deployment", function () {
        it("Set the the token address as ERC20Token", async function () {
            expect(await exchange.getERC20Token()).to.equal(myToken.address);
        });
    });

    /*
     ╔════════════════════════════════╗
     ║       PROVIDE LIQUIDITY        ║
     ╚════════════════════════════════╝
    */
    describe("Provide liquidity", function () {

        beforeEach(async function () {
            const ERC20TokenAmt = BigInt(10e18);
            await myToken.approve(exchange.address, ERC20TokenAmt);
        });

        it("Emit LiquidityProvided event", async function () {
            expect(
                await exchange.provideLiquidity(
                    BigInt(10e18),
                    { value: BigInt(10e18) }
                )
            ).to.emit(exchange, "LiquidityProvided")
        });

        it("Give first liquidity provider 100 LP", async function () {
            await exchange.provideLiquidity(
                BigInt(10e18),
                { value: BigInt(10e18) }
            );
            const addr1LP = await exchange.getLiquidityPositions(addr1.address);
            expect(addr1LP).to.equal(BigInt(100));
        });

        it("Give the next liquidity provider proper LP", async function () {
            await exchange.provideLiquidity(
                BigInt(10e18),
                { value: BigInt(10e18) }
            );
            const ERC20TokenAmt = BigInt(2e18);
            const ethAmt = BigInt(2e18);
            const balanceERC20Token = BigInt(await myToken.balanceOf(exchange.address));
            const totalLP = BigInt(await exchange.getTotalLiquidityPositions());
            const expectedLP = BigInt(totalLP * ERC20TokenAmt / balanceERC20Token);

            await myToken.connect(addr2).approve(exchange.address, ERC20TokenAmt);
            await exchange.connect(addr2).provideLiquidity(
                ERC20TokenAmt,
                { value: ethAmt }
            );

            const realLP = await exchange.getLiquidityPositions(addr2.address);
            expect(realLP).to.equal(expectedLP);
        });

        it("Give a previous liquidity provider proper LP", async function () {
            await exchange.provideLiquidity(
                BigInt(10e18),
                { value: BigInt(10e18) }
            );
            const oldLP = BigInt(await exchange.getLiquidityPositions(addr1.address));
            const ERC20TokenAmt = BigInt(4e18);
            const ethAmt = BigInt(4e18);
            const balanceERC20Token = BigInt(await myToken.balanceOf(exchange.address));
            const totalLP = BigInt(await exchange.getTotalLiquidityPositions());
            const expectedLP = BigInt(totalLP * ERC20TokenAmt / balanceERC20Token) + oldLP;

            await myToken.connect(addr1).approve(exchange.address, ERC20TokenAmt);
            await exchange.connect(addr1).provideLiquidity(
                ERC20TokenAmt,
                { value: ethAmt }
            );

            const realLP = BigInt(await exchange.getLiquidityPositions(addr1.address));
            expect(realLP).to.equal(expectedLP);
        });

        it("Correctly estimate eth to provide", async function () {
            await exchange.provideLiquidity(
                BigInt(10e18),
                { value: BigInt(10e18) }
            );
            const ercAmt = BigInt(1e17)
            const ethBalance = BigInt(await exchange.ethBalance())
            const erc20Balance = BigInt(await myToken.balanceOf(exchange.address))
            const expectedEstimate = ethBalance * ercAmt / erc20Balance

            expect(await exchange.estimateEthToProvide(ercAmt)).to.equal(expectedEstimate)
        });

        it("Correctly estimate erc-20 to provide", async function () {
            await exchange.provideLiquidity(
                BigInt(10e18),
                { value: BigInt(10e18) }
            );
            const ethAmt = BigInt(1e17)
            const ethBalance = BigInt(await exchange.ethBalance())
            const erc20Balance = BigInt(await myToken.balanceOf(exchange.address))
            const expectedEstimate = erc20Balance * ethAmt / ethBalance

            expect(await exchange.estimateERC20TokenToProvide(ethAmt)).to.equal(expectedEstimate)
        });

        it("Revert if tokens in ratio not equal to pool's", async function () {
            await exchange.provideLiquidity(
                BigInt(10e18),
                { value: BigInt(10e18) }
            );
            const ERC20TokenAmt = BigInt(2e18);
            const ethAmt = BigInt(1e18);

            await myToken.connect(addr2).approve(exchange.address, ERC20TokenAmt);
            await expect(
                exchange.connect(addr2).provideLiquidity(
                    ERC20TokenAmt,
                    { value: ethAmt }
                )
            ).to.be.reverted;
        });

        it("Revert if user tries to provide liquidity with 0 ether", async function () {
            await expect(
                exchange.provideLiquidity(
                    BigInt(10e18),
                    { value: BigInt(0) }
                )
            ).to.be.reverted;
        });

        it("Revert if user tries to provide liquidity with 0 ERC-20", async function () {
            await expect(
                exchange.provideLiquidity(
                    BigInt(0),
                    { value: BigInt(10e18) }
                )
            ).to.be.reverted;
        });
    });

    /*
     ╔═════════════════════════╗
     ║        WITHDRAW         ║
     ╚═════════════════════════╝
    */
    describe("Withdraw liquidity", function () {
        beforeEach(async function () {
            const ERC20TokenAmt = BigInt(10e18);
            const ethAmt = BigInt(10e18);
            await myToken.approve(exchange.address, ERC20TokenAmt);
            await exchange.provideLiquidity(
                ERC20TokenAmt,
                { value: ethAmt }
            );
        });

        it("Emit LiquidityWithdrew event", async function () {
            expect(await exchange.withdrawLiquidity(BigInt(50))).to.emit(exchange, "LiquidityWithdrew")
        });

        it("Give address proper amount of ERC20Tokens on withdraw", async function () {
            const balanceBefore = BigInt(await myToken.balanceOf(addr1.address));
            const LPtoBurn = BigInt(50);
            const totalERC20Token = BigInt(await myToken.balanceOf(exchange.address));
            const totalLP = BigInt(await exchange.getTotalLiquidityPositions());
            const expectedERC20Token = BigInt(LPtoBurn * totalERC20Token / totalLP) + balanceBefore;

            await exchange.withdrawLiquidity(LPtoBurn);
            expect(await myToken.balanceOf(addr1.address)).to.equal(expectedERC20Token)
        });

        it("Give address proper amount of eth on withdraw", async function () {
            const LPtoBurn = BigInt(20);
            const totalEth = (await exchange.ethBalance()).toBigInt();
            const totalLP = BigInt(await exchange.getTotalLiquidityPositions());
            const expectedEth = LPtoBurn * totalEth / totalLP;

            const transaction = await exchange.connect(addr1).withdrawLiquidity(LPtoBurn);
            const receipt = await transaction.wait();
            const ethWithdrew = (receipt.events[1].args.amountEthWithdrew).toBigInt();
            expect(ethWithdrew).to.equal(expectedEth);
        });

        it("Revert if caller tries to burn more liquidity than they have", async function () {
            const addr1LP = await exchange.getLiquidityPositions(addr1.address);
            await expect(exchange.withdrawLiquidity(addr1LP + 1)).to.be.reverted;
        });

        it("Revert if caller tries to burn all liquidity positions in the pool", async function () {
            await expect(exchange.withdrawLiquidity(100)).to.be.reverted;
        });

    });

    /*
     ╔══════════════════╗
     ║       SWAP       ║
     ╚══════════════════╝
    */
    describe("Swap for ERC-20", function () {
        beforeEach(async function () {
            const ERC20TokenAmt = BigInt(10e18);
            const ethAmt = BigInt(10e18);
            await myToken.approve(exchange.address, ERC20TokenAmt);
            await exchange.provideLiquidity(
                ERC20TokenAmt,
                { value: ethAmt }
            );
        });

        it("Emit SwapForERC20Token event", async function () {
            expect(await exchange.swapForERC20Token({ value: BigInt(1e17) })).to.emit(exchange, "SwapForERC20Token")
        });

        it("Give address proper amount of ERC-20 Tokens", async function () {
            const ethAmt = BigInt(1e17);

            const addr1BalanceBefore = BigInt(await myToken.balanceOf(addr1.address));
            const K = BigInt(await exchange.getK());
            const ERC20TokenBalance = BigInt(await myToken.balanceOf(exchange.address));
            const ethBalanceAfterSwap = BigInt(await exchange.ethBalance()) + ethAmt;
            const addr1ExpectedERC20Token = BigInt((ERC20TokenBalance - (K / ethBalanceAfterSwap)) + addr1BalanceBefore)

            await exchange.swapForERC20Token({ value: ethAmt });

            const addr1RealERC20Token = await myToken.balanceOf(addr1.address)
            expect(addr1RealERC20Token).to.equal(addr1ExpectedERC20Token)
        });

        it("Correctly estimate swap for ERC-20 Tokens", async function () {
            const ethAmt = BigInt(1e17)
            const K = BigInt(await exchange.getK());
            const ERC20TokenBalance = BigInt(await myToken.balanceOf(exchange.address));
            const ethBalanceAfterSwap = BigInt(await exchange.ethBalance()) + ethAmt;
            const expectedEstimate = BigInt(ERC20TokenBalance - (K / ethBalanceAfterSwap))

            expect(await exchange.estimateSwapForERC20Token(ethAmt)).to.equal(expectedEstimate)
        });

        it("Swap doesn't change K value", async function () {
            const oldK = BigInt(await exchange.getK())
            await exchange.swapForERC20Token({ value: BigInt(1e17) })
            const newK = BigInt(await exchange.getK())

            expect(oldK).to.equal(newK);
        });

        it("provideLiquidity() gives correct liquidity positions after a swap", async function () {
            await exchange.swapForERC20Token({ value: BigInt(1e18) })

            const oldLP = BigInt(await exchange.getLiquidityPositions(addr1.address));
            const ethAmt = BigInt(4e18);
            const ERC20TokenAmt = BigInt(await exchange.estimateERC20TokenToProvide(ethAmt));
            const balanceERC20Token = BigInt(await myToken.balanceOf(exchange.address));
            const totalLP = BigInt(await exchange.getTotalLiquidityPositions());
            const expectedLP = BigInt(totalLP * ERC20TokenAmt / balanceERC20Token) + oldLP;

            await myToken.connect(addr1).approve(exchange.address, ERC20TokenAmt);
            await exchange.connect(addr1).provideLiquidity(
                ERC20TokenAmt,
                { value: ethAmt }
            );

            const realLP = BigInt(await exchange.getLiquidityPositions(addr1.address));
            expect(realLP).to.equal(expectedLP);
        });

        it("withdrawLiquidity() still works after a swap", async function () {
            await exchange.swapForERC20Token({ value: BigInt(1e18) })

            const balanceBefore = BigInt(await myToken.balanceOf(addr1.address));
            const LPtoBurn = BigInt(50);
            const totalERC20Token = BigInt(await myToken.balanceOf(exchange.address));
            const totalLP = BigInt(await exchange.getTotalLiquidityPositions());
            const expectedERC20Token = BigInt(LPtoBurn * totalERC20Token / totalLP) + balanceBefore;

            await exchange.withdrawLiquidity(LPtoBurn);
            expect(await myToken.balanceOf(addr1.address)).to.equal(expectedERC20Token)
        });

        it("Give address proper amount of ERC-20 tokens after a withdraw", async function () {
            await exchange.withdrawLiquidity(BigInt(50))

            const ethAmt = BigInt(1e17);
            const addr1BalanceBefore = BigInt(await myToken.balanceOf(addr1.address));
            const K = BigInt(await exchange.getK());
            const ERC20TokenBalance = BigInt(await myToken.balanceOf(exchange.address));
            const ethBalanceAfterSwap = BigInt(await exchange.ethBalance()) + ethAmt;
            const addr1ExpectedERC20Token = BigInt((ERC20TokenBalance - (K / ethBalanceAfterSwap)) + addr1BalanceBefore)

            await exchange.swapForERC20Token({ value: ethAmt });

            const addr1RealERC20Token = await myToken.balanceOf(addr1.address)
            expect(addr1RealERC20Token).to.equal(addr1ExpectedERC20Token)
        });
    });

    describe("Swap for Ether", function () {
        beforeEach(async function () {
            const ERC20TokenAmt = BigInt(10e18);
            const ethAmt = BigInt(10e18);
            await myToken.approve(exchange.address, ERC20TokenAmt);
            await exchange.provideLiquidity(
                ERC20TokenAmt,
                { value: ethAmt }
            );

            // approve additional tokens for swap
            const additionalERC20Approve = BigInt(2e18)
            await myToken.approve(exchange.address, additionalERC20Approve);
        });

        it("Emit SwapForEth event", async function () {
            expect(await exchange.swapForEth(BigInt(1e17))).to.emit(exchange, "SwapForEth")
        });

        it("Give address proper amount of Ether", async function () {
            const ercAmt = BigInt(1e17);
            const K = BigInt(await exchange.getK());
            const ERC20TokenBalance = BigInt(await myToken.balanceOf(exchange.address))
            const totalEthAfterSwap = K / (ERC20TokenBalance + ercAmt)
            const ethBalance = BigInt(await exchange.ethBalance())
            const expectedEthWithdrew = ethBalance - totalEthAfterSwap

            const transaction = await exchange.swapForEth(ercAmt);
            const receipt = await transaction.wait();
            const ethWithdrew = receipt.events[2].args.amountEthWithdrew;

            expect(ethWithdrew).to.equal(expectedEthWithdrew);
        });

        it("Correctly estimate swap for Ether", async function () {
            const ercAmt = BigInt(1e17);
            const K = BigInt(await exchange.getK());
            const ERC20TokenBalance = BigInt(await myToken.balanceOf(exchange.address))
            const totalEthAfterSwap = K / (ERC20TokenBalance + ercAmt)
            const ethBalance = BigInt(await exchange.ethBalance())
            const expectedEstimate = ethBalance - totalEthAfterSwap

            expect(await exchange.estimateSwapForEth(ercAmt)).to.equal(expectedEstimate)
        });

        it("Swap doesn't change K value", async function () {
            const oldK = BigInt(await exchange.getK())
            await exchange.swapForEth(BigInt(1e17))
            const newK = BigInt(await exchange.getK())

            expect(oldK).to.equal(newK);
        });

        it("provideLiquidity() gives correct liquidity positions after a swap", async function () {
            await exchange.swapForEth(BigInt(1e18))

            const oldLP = BigInt(await exchange.getLiquidityPositions(addr1.address));
            const ethAmt = BigInt(4e18);
            const ERC20TokenAmt = BigInt(await exchange.estimateERC20TokenToProvide(ethAmt));
            const balanceERC20Token = BigInt(await myToken.balanceOf(exchange.address));
            const totalLP = BigInt(await exchange.getTotalLiquidityPositions());
            const expectedLP = BigInt(totalLP * ERC20TokenAmt / balanceERC20Token) + oldLP;

            await myToken.connect(addr1).approve(exchange.address, ERC20TokenAmt);
            await exchange.connect(addr1).provideLiquidity(
                ERC20TokenAmt,
                { value: ethAmt }
            );

            const realLP = BigInt(await exchange.getLiquidityPositions(addr1.address));
            expect(realLP).to.equal(expectedLP);
        });

        it("withdrawLiquidity() still works after a swap", async function () {
            await exchange.swapForEth(BigInt(1e18))

            const balanceBefore = BigInt(await myToken.balanceOf(addr1.address))
            const LPtoBurn = BigInt(50)
            const totalERC20Token = BigInt(await myToken.balanceOf(exchange.address))
            const totalLP = BigInt(await exchange.getTotalLiquidityPositions());
            const expectedERC20Token = BigInt(LPtoBurn * totalERC20Token / totalLP) + balanceBefore;

            await exchange.withdrawLiquidity(LPtoBurn);
            expect(await myToken.balanceOf(addr1.address)).to.equal(expectedERC20Token)
        });

        it("Give address proper amount of Ether after a withdraw", async function () {
            await exchange.withdrawLiquidity(BigInt(50))

            const ercAmt = BigInt(1e17)
            const K = BigInt(await exchange.getK())
            const ERC20TokenBalance = BigInt(await myToken.balanceOf(exchange.address))
            const totalEthAfterSwap = K / (ERC20TokenBalance + ercAmt)
            const ethBalance = BigInt(await exchange.ethBalance())
            const expectedEthWithdrew = ethBalance - totalEthAfterSwap

            const transaction = await exchange.swapForEth(ercAmt);
            const receipt = await transaction.wait();
            const ethWithdrew = receipt.events[2].args.amountEthWithdrew;

            expect(ethWithdrew).to.equal(expectedEthWithdrew);
        });

    });

    // TODO: use the address of the exchange I deployed here to find address without using the mock's "ethBalance()"

});