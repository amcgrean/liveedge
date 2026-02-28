import { Metadata } from 'next';
import ProductsClient from './ProductsClient';

export const metadata: Metadata = { title: 'Products | Admin | Beisser Takeoff' };

export default function ProductsPage() {
  return <ProductsClient />;
}
