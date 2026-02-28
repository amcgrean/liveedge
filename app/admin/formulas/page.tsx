import { Metadata } from 'next';
import FormulasClient from './FormulasClient';

export const metadata: Metadata = { title: 'Formulas | Admin | Beisser Takeoff' };

export default function FormulasPage() {
  return <FormulasClient />;
}
