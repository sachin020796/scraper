import puppeteer, { Page } from 'puppeteer';
import * as fs from 'fs';
import { createObjectCsvWriter } from 'csv-writer';

export interface Product {
  SKU: string;
  Source: string;
  Title: string;
  Description: string;
  Price: string;
  Reviews: string;
  Rating: string;
}

const skusFilePath = 'skus.json';
const outputCsvFilePath = 'product_data.csv';
const errorLogFilePath = 'errors.log';

// Read SKUs from the JSON file
function readSKUs(): { skus: Array<{ Type: string; SKU: string }> } {
  const data = fs.readFileSync(skusFilePath, 'utf8');
  return JSON.parse(data);
}

// Write the scraped data to a CSV file
async function writeCSV(products: Product[]) {
  const csvWriter = createObjectCsvWriter({
    path: outputCsvFilePath,
    header: [
      { id: 'SKU', title: 'SKU' },
      { id: 'Source', title: 'Source' },
      { id: 'Title', title: 'Title' },
      { id: 'Description', title: 'Description' },
      { id: 'Price', title: 'Price' },
      { id: 'Reviews', title: 'Reviews' },
      { id: 'Rating', title: 'Rating' },
    ],
    append: true,
  });

  await csvWriter.writeRecords(products);
  console.log('Data written to product_data.csv');
}

// Check for CAPTCHA presence on the page
async function isCaptcha(page: Page): Promise<boolean> {
  try {
    const captchaSelector = '#captcha';
    const captchaVisible = await page.$(captchaSelector);
    return captchaVisible !== null;
  } catch {
    return false;
  }
}

// Randomly delay between requests to avoid bot detection
function randomDelay() {
  const delay = Math.floor(Math.random() * 2000) + 2000; // Random delay between 2 to 4 seconds
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Set random user agent to avoid bot detection
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.122 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edge/91.0.864.59',
];

async function setRandomUserAgent(page: Page) {
  await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
}

// Function to scrape product details from Amazon or Walmart
async function scrapeProduct(page: Page, sku: string, source: string): Promise<Product | null> {
  let title = '', description = '', price = '', reviews = '', rating = '';

  try {
    if (source === 'Amazon') {
      await page.goto(`https://www.amazon.com/dp/${sku}`, { waitUntil: 'domcontentloaded' });

      // Wait for specific elements to load
      await page.waitForSelector('span#productTitle', { timeout: 30000 });

      // Check for CAPTCHA
      if (await isCaptcha(page)) {
        console.error(`CAPTCHA detected on Amazon for SKU ${sku}`);
        fs.appendFileSync(errorLogFilePath, `CAPTCHA detected on Amazon for SKU ${sku}\n`);
        return null;
      }

      title = await page.$eval('span#productTitle', el => el.textContent?.trim() || '');
      description = await page.$eval('#productDescription', el => el.textContent?.trim() || '');
      price = await page.$eval('span.a-price span.a-offscreen', el => el.textContent?.trim() || '');
      reviews = await page.$eval('#acrCustomerReviewText', el => el.textContent?.trim() || '0 reviews');
      rating = await page.$eval('span.a-icon-alt', el => el.textContent?.trim() || '0 stars');
    } else if (source === 'Walmart') {
      await page.goto(`https://www.walmart.com/ip/${sku}`, { waitUntil: 'domcontentloaded' });

      // Wait for title or fallback to debugging if not found
      try {
        await page.waitForSelector('[data-testid="product-title"]', { timeout: 60000 });
      } catch {
        console.error(`Element not found for SKU ${sku}.`);
        await page.screenshot({ path: `error_${sku}.png` });
        fs.appendFileSync(errorLogFilePath, `Element not found for SKU ${sku}\n`);
        return null;
      }

      // Check for CAPTCHA
      if (await isCaptcha(page)) {
        console.error(`CAPTCHA detected for Walmart SKU ${sku}`);
        fs.appendFileSync(errorLogFilePath, `CAPTCHA detected for Walmart SKU ${sku}\n`);
        return null;
      }

      title = await page.$eval('[data-testid="product-title"]', el => el.textContent?.trim() || '');
      description = await page.$eval('div.about-desc', el => el.textContent?.trim() || '');
      price = await page.$eval('span.price-characteristic', el => el.textContent?.trim() || '');
      reviews = await page.$eval('span.reviews-header span.visuallyhidden', el => el.textContent?.trim() || '0 reviews');
      rating = await page.$eval('span.average-rating', el => el.textContent?.trim() || '0 stars');
    }

    if (title && price) {
      return {
        SKU: sku,
        Source: source,
        Title: title,
        Description: description,
        Price: price,
        Reviews: reviews,
        Rating: rating,
      };
    }
  } catch (error: any) {
    console.error(`Error scraping SKU ${sku}:`, error);
    fs.appendFileSync(errorLogFilePath, `Error scraping SKU ${sku}: ${error.message}\n`);
  }

  return null;
}

// Main function to start the scraping process
async function startScraping() {
  const { skus } = readSKUs();
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const scrapedProducts: Product[] = [];

  for (const { Type, SKU } of skus) {
    console.log(`Scraping SKU: ${SKU} from ${Type}`);

    await setRandomUserAgent(page); // Set a random user-agent
    const product = await scrapeProduct(page, SKU, Type);

    if (product) {
      scrapedProducts.push(product);
    }

    await randomDelay(); // Wait randomly to avoid detection
  }

  await writeCSV(scrapedProducts);
  await browser.close();
}

startScraping().catch(error => {
  console.error('Error during scraping:', error);
});
