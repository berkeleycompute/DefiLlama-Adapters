const { get } = require('../helper/http');

/**
 * @fileoverview adapter to calculate the tvl of the Silicon.net protocol.
 * 
 * This adapter calculates the tvl of the Silicon.net protocol by:
 * 1. Fetching all GPU NFTs from the Silicon.net API
 * 2. Calculating the value of the GPUs in USD
 * 3. Converting the USD value of the GPUs into pool tokens.
 * 4. Summing that value with the number of existing pool tokens
 * 
 * @testing you can test this adapter by running
 * npm install
 * export LLAMA_DEBUG_MODE="true" 
 * node test.js projects/silicon.net/index.js
 */

// TODO: when we submit our adapter pr, we will fill in the following details.
// ##### Name (to be shown on DefiLlama):
// Silicon.net

// ##### Twitter Link:
// https://twitter.com/silicondonet

// ##### Website Link:
// https://silicon.net

// ##### Logo (High resolution, will be shown with rounded borders):
// [Upload or link to your logo]

// ##### Category (full list at https://defillama.com/categories) *Please choose only one:
// RWA

// ##### Short Description (to be shown on DefiLlama):
// GPU compute infrastructure protocol tokenizing real-world GPU assets

// ##### methodology (what is being counted as tvl, how is tvl being calculated):
// copy the tvl string below and expand on it, even, if we want

// Silicon.net Protocol Contract - will be specified later
const POOL_TOKEN = "0xb59781c5bf9330b9bb7ce64df7cc118fec28b744"; // TODO: Update with actual contract address
const ORACLE = "0x0000000000000000000000000000000000000000"; // TODO: Update with actual contract address

// GPU valuation prices in USD
const GPU_PRICES = {
  '4090': 3500,
  '5090': 5000,
  'H100': 21000,
  'H200': 31000,
  'A6000': 6000,
  'A5000': 2000, 
  '4000Ada': 1500
};

/**
 * Extracts GPU model from gpu_type string by checking against GPU_PRICES keys
 * @param {string} gpuType - GPU type string (e.g., "4090", "5090", "H100-SXM")
 * @returns {string|null} - Normalized GPU model key from GPU_PRICES or null
 */
function normalizeGPUType(gpuType) {
    if (!gpuType) return null;
    
    const type = gpuType.toUpperCase();
    
    // Check if the GPU type includes any of the keys from GPU_PRICES
    // Return the first match found
    for (const key of Object.keys(GPU_PRICES)) {
      if (type.includes(key.toUpperCase())) {
        return key;
      }
    }
    
    return null;
  }

/**
 * Fetches all GPU NFTs from Silicon.net API with pagination
 * @returns {Promise<Array>} Array of GPU objects
 */
async function fetchAllGPUNFTs() {
  const allGPUs = [];
  let page = 1;
  const pageSize = 100; // the api has a maximum effective page size, can be edited if we like.

  while (true) {
    try {
      const url = `https://jhdzwsjlmavfzceoshxo.supabase.co/functions/v1/api/public/gpu-earnings/gpus-list?page=${page}&pageSize=${pageSize}&sort=month-1-earnings&order=desc&excludeZeroEarnings=false&onlyWithApr=false`;
      
      const response = await get(url);
      
      // Check if response has data property or is direct array
      const gpuData = response.data;
      console.log({metadata: response.metadata, message: response.message});
      
      // Assuming response is an array of GPUs or has a data property
      if (!gpuData || !Array.isArray(gpuData) || gpuData.length === 0) {
        break;
      }

      allGPUs.push(...gpuData);
      
      // If we got less than pageSize, we've reached the last page
      if (gpuData.length < pageSize) {
        break;
      }
      
      page++;
    } catch (error) {
      console.error(`Error fetching GPUs at page ${page}:`, error.message);
      break;
    }
  }

  return allGPUs;
}

/**
 * Calculates total GPU valuation, denominated in USD
 * @param {Array} gpus - Array of GPU objects
 * @returns {number} Total USD value
 */
function calculateGPUValue(gpus) {
  // Initialize counts for all GPU types in GPU_PRICES
  const gpuCounts = {};
  Object.keys(GPU_PRICES).forEach(key => {
    gpuCounts[key] = 0;
  });
  
  const uncategorizedGPUs = [];

  // Count each GPU type
  gpus.forEach(gpu => {
    const normalizedType = normalizeGPUType(gpu.gpu_type);
    if (normalizedType && gpuCounts.hasOwnProperty(normalizedType)) {
      gpuCounts[normalizedType]++;
    } else {
      // Track uncategorized GPUs for debugging
      if (!uncategorizedGPUs.includes(gpu.gpu_type)) {
        uncategorizedGPUs.push(gpu.gpu_type);
      }
    }
  });

  // Calculate total value dynamically from GPU_PRICES
  let totalValue = 0;
  Object.keys(GPU_PRICES).forEach(gpuType => {
    totalValue += gpuCounts[gpuType] * GPU_PRICES[gpuType];
  });

  console.log('GPU Counts:', gpuCounts, "total gpus", Object.values(gpuCounts).reduce((acc, count) => acc + count, 0));
  console.log('Total GPU Value (USD):', totalValue);
  
  if (uncategorizedGPUs.length > 0) {
    console.warn('Uncategorized GPU types:', uncategorizedGPUs);
  }

  return totalValue;
}

/**
 * Main TVL function for Silicon.net's gpu nfts
 * @param {Object} api - DefiLlama API instance
 */
async function nfts(api) {
  // Fetch and value GPU NFTs
  const gpus = await fetchAllGPUNFTs();
  const gpuValue = calculateGPUValue(gpus);

  // TODO: convert the usdc value of the gpus into pool tokens. Andrew says ask the oracle or pool contract (idk which, check abi) for the price of the pool tokens via getPoolTokensForDeposit. 
  // We may need an ABI.json to do so.

  // Add GPU valuation as USD value
  api.addUSDValue(gpuValue);
}

/**
 * Main TVL function for Silicon.net's pool tokens
 * @param {Object} api - DefiLlama API instance
 */
async function tokens(api) {
  // Get total supply of Silicon pool tokens
  // This counts all pool tokens that exist in circulation
  const poolTokenSupply = await api.call({
    target: POOL_TOKEN,
    abi: 'erc20:totalSupply',
    permitFailure: true
  });
  
  if (poolTokenSupply) {
    api.add(POOL_TOKEN, poolTokenSupply);
  }
}

module.exports = {
  methodology: 
    `TVL is calculated by summing: 
        (1) The value of GPU NFTs in the protocol, based on real-time GPU data from the Silicon.net API. GPU valuations: RTX 4090 ($3,500), RTX 5090 ($5,000), H100 ($21,000), H200 ($31,000), A6000 ($6,000), A5000 ($2,000), and RTX 4000 Ada ($1,500). 
        (2) The value of all fungible pool tokens in circulation. 
        GPU valuations reflect the estimated market value of compute hardware backing the protocol.`,
    arbitrum: {
    tvl: tokens,
  },
  base: {
    tvl: nfts,
  },
};

