require('dotenv').config() // needed to configure REACT_APP_SUBGRAPH_URL used by @balancer-labs/sor
const fs = require('fs');
const sor = require('@balancer-labs/sor')
const BigNumber = require('bignumber.js')
const ethers = require('ethers')
const proxyArtifact = require('../static/ExchangeProxy.json');

// constants
const MAX_UINT = ethers.constants.MaxUint256;
const MULTI = '0xeefba1e63905ef1d7acba5a8513c70307c1ce441';

export default class Balancer {
  constructor (network = 'kovan') {
    // network defaults to kovan
    const providerUrl = `https://${network}.infura.io/v3/${process.env.INFURA_API_KEY}`
    this.network = network
    this.provider = new ethers.providers.JsonRpcProvider(providerUrl)

    if (network === 'kovan') {
      this.erc20Tokens = JSON.parse(fs.readFileSync('src/static/erc20_tokens_kovan.json'))
      this.exchangeProxy = '0x4e67bf5bD28Dd4b570FBAFe11D0633eCbA2754Ec'
    } else if (network === 'mainnet') {
      this.erc20Tokens = JSON.parse(fs.readFileSync('src/static/erc20_tokens.json'))
      this.exchangeProxy = '0x6317C5e82A06E1d8bf200d21F4510Ac2c038AC81'
    } else {
      throw Error(`Invalid network ${network}`)
    }
  }

  async getSwaps (tokenIn, tokenOut, amount, side) {

    // Fetch all the pools that contain the tokens provided
    const pools = await sor.getPoolsWithTokens(tokenIn, tokenOut)
    if(pools.pools.length === 0) {
      console.log('No pools contain the tokens provided');
      return;
    }
    
    // Parse the pools and pass them to smart order outer to get the swaps needed
    let poolData
    if (this.network === 'mainnet') {
      poolData = await sor.parsePoolDataOnChain(pools.pools, tokenIn, tokenOut, MULTI, this.provider)
    } else {
      poolData = await sor.parsePoolData(pools.pools, tokenIn, tokenOut)
    }
    let sorSwaps, swapsFormatted
    if (side === 'sell') {
      sorSwaps = sor.smartOrderRouter(
        poolData,             // balancers: Pool[]
        'swapExactIn',        // swapType: string
        amount,               // targetInputAmount: BigNumber
        new BigNumber('4'),   // maxBalancers: number
        0                     // costOutputToken: BigNumber
      )
      swapsFormatted = sor.formatSwapsExactAmountIn(sorSwaps, MAX_UINT, 0)  
    }

    // Create correct swap format for new proxy
    let swaps = [];
    for (let i = 0; i < swapsFormatted.length; i++) {
        let swap = {
            pool: swapsFormatted[i].pool,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            swapAmount: swapsFormatted[i].tokenInParam,
            limitReturnAmount: swapsFormatted[i].tokenOutParam,
            maxPrice: swapsFormatted[i].maxPrice.toString(),
        };
        swaps.push(swap);
    }

    const expectedOut = sor.calcTotalOutput(swapsFormatted, poolData)
    return { swaps, expectedOut }
  }

  async batchSwapExactIn (wallet, swaps, tokenIn, tokenOut, amount, gasPrice = process.env.GAS_PRICE) {
    const GAS_LIMIT = 1200000
    const contract = new ethers.Contract(this.exchangeProxy, proxyArtifact.abi, wallet)
    const tx = await contract.batchSwapExactIn(
      swaps,
      tokenIn,
      tokenOut,
      amount, 
      0, {
        gasPrice: gasPrice*1e9,
        gasLimit: GAS_LIMIT
      }
    )
    return tx
  }
}
