import { redirect } from 'next/navigation';

// Default to Fort Dodge when navigating to /scorecard/branch
export default function BranchIndexPage() {
  redirect('/scorecard/branch/20GR');
}
