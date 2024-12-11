import { createObjectCsvWriter } from 'csv-writer';
import { Product } from './scraper';

export function writeToCSV(productData: Product[]) {
  const csvWriter = createObjectCsvWriter({
    path: 'product_data.csv',
    header: [
      { id: 'SKU', title: 'SKU' },
      { id: 'Source', title: 'Source' },
      { id: 'Title', title: 'Title' },
      { id: 'Description', title: 'Description' },
      { id: 'Price', title: 'Price' },
      { id: 'Reviews', title: 'Reviews' }
    ],
    append: true
  });

  csvWriter.writeRecords(productData)
    .then(() => {
      console.log('Data written to product_data.csv');
    })
    .catch(err => {
      console.error('Error writing to CSV:', err);
    });
}

