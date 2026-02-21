'use client';

import { useState } from 'react';
import type { IPost } from '@/lib/types';
import StatusBadge from './StatusBadge';

interface PostCardProps {
  post: IPost;
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
}

export default function PostCard({ post, onUpdate }: PostCardProps) {
  const [editedReply, setEditedReply] = useState(post.editedReply || post.aiReply || '');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<string>('');

  const handleAction = async (status: string) => {
    setLoading(true);
    await onUpdate(post._id!, { status, editedReply: editedReply !== post.aiReply ? editedReply : undefined });
    setLoading(false);
  };

  const handlePostToX = async () => {
    setPosting(true);
    setPostResult('');
    try {
      const res = await fetch('/api/post-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post._id }),
      });
      const data = await res.json();
      if (data.success) {
        setPostResult(`Posted! ${data.isReply ? 'Reply' : 'Tweet'} ID: ${data.tweetId}`);
        await onUpdate(post._id!, {});
      } else {
        setPostResult(`Error: ${data.error}`);
      }
    } catch {
      setPostResult('Failed to post to X');
    }
    setPosting(false);
  };

  const handlePostToFacebook = async () => {
    setPosting(true);
    setPostResult('');
    try {
      const res = await fetch('/api/fb-post-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post._id }),
      });
      const data = await res.json();
      if (data.success) {
        setPostResult('Comment posted to Facebook!');
        await onUpdate(post._id!, {});
      } else {
        setPostResult(`Error: ${data.error}`);
      }
    } catch {
      setPostResult('Failed to post to Facebook');
    }
    setPosting(false);
  };

  const replyText = post.editedReply || post.aiReply;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-gray-900">{post.author}</span>
            <StatusBadge status={post.status} />
            {post.aiRelevanceScore !== undefined && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                post.aiRelevanceScore >= 70 ? 'bg-green-50 text-green-700' :
                post.aiRelevanceScore >= 40 ? 'bg-yellow-50 text-yellow-700' :
                'bg-red-50 text-red-700'
              }`}>
                Score: {post.aiRelevanceScore}
              </span>
            )}
            {post.aiTone && (
              <span className="text-xs text-gray-500">Tone: {post.aiTone}</span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {post.platform} &middot; {new Date(post.scrapedAt).toLocaleDateString()}
          </p>
        </div>
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-700 text-sm shrink-0"
        >
          View original
        </a>
      </div>

      <div className="bg-gray-50 rounded-md p-3">
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{post.content}</p>
      </div>

      {post.keywordsMatched && post.keywordsMatched.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {post.keywordsMatched.map((kw) => (
            <span key={kw} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
              {kw}
            </span>
          ))}
        </div>
      )}

      {post.aiReasoning && (
        <p className="text-xs text-gray-500 italic">AI Reasoning: {post.aiReasoning}</p>
      )}

      {replyText && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            {post.status === 'posted' ? 'Posted Reply:' : 'Suggested Reply:'}
          </label>
          {editing ? (
            <textarea
              value={editedReply}
              onChange={(e) => setEditedReply(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
            />
          ) : (
            <div className={`rounded-md p-3 ${post.status === 'posted' ? 'bg-indigo-50 border border-indigo-200' : 'bg-green-50 border border-green-200'}`}>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{editedReply || replyText}</p>
              {post.status === 'posted' && post.postedAt && (
                <p className="text-xs text-indigo-400 mt-1.5">
                  ✓ Posted {new Date(post.postedAt).toLocaleString()}
                </p>
              )}
              {post.replyUrl && (
                <a
                  href={post.replyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-500 hover:underline mt-0.5 block"
                >
                  View posted reply →
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {(post.status === 'evaluated' || post.status === 'new') && (
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => handleAction('approved')}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => setEditing(!editing)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            {editing ? 'Done Editing' : 'Edit Reply'}
          </button>
          <button
            onClick={() => handleAction('rejected')}
            disabled={loading}
            className="px-4 py-2 bg-red-100 text-red-700 text-sm rounded-md hover:bg-red-200 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}

      {post.status === 'approved' && (
        <div className="flex gap-2 pt-2 flex-wrap items-center">
          {post.platform === 'twitter' && (
            <button
              onClick={handlePostToX}
              disabled={posting}
              className="px-4 py-2 bg-black text-white text-sm rounded-md hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1.5"
            >
              {posting ? (
                'Posting...'
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Post to X
                </>
              )}
            </button>
          )}
          {post.platform === 'facebook' && (
            <button
              onClick={handlePostToFacebook}
              disabled={posting}
              className="px-4 py-2 bg-[#1877F2] text-white text-sm rounded-md hover:bg-[#1565d8] disabled:opacity-50 flex items-center gap-1.5"
            >
              {posting ? (
                'Posting...'
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.928-1.956 1.879v2.273h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
                  </svg>
                  Post to Facebook
                </>
              )}
            </button>
          )}
          <button
            onClick={() => {
              navigator.clipboard.writeText(editedReply || replyText || '');
            }}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700"
          >
            Copy Reply
          </button>
          <button
            onClick={() => handleAction('posted')}
            disabled={loading}
            className="px-4 py-2 bg-gray-800 text-white text-sm rounded-md hover:bg-gray-900 disabled:opacity-50"
          >
            Mark as Posted
          </button>
          {postResult && (
            <span className={`text-sm ${postResult.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {postResult}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
