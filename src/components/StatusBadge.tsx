'use client';

import type { PostStatus } from '@/lib/types';

const statusConfig: Record<PostStatus, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-blue-100 text-blue-800' },
  evaluating: { label: 'Evaluating...', className: 'bg-yellow-100 text-yellow-800 animate-pulse' },
  evaluated: { label: 'Evaluated', className: 'bg-purple-100 text-purple-800' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
  posted: { label: 'Posted', className: 'bg-gray-100 text-gray-800' },
};

export default function StatusBadge({ status }: { status: PostStatus }) {
  const config = statusConfig[status] || statusConfig.new;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
