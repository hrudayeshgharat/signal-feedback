import type { Metadata } from 'next';
import FeedbackApp from './FeedbackApp';
export const metadata: Metadata = { title: 'Signal — Customer Feedback Intelligence', description: 'Explore customer reviews, discover topics, compare sentiment, and inspect the evidence behind every finding.' };
export default function FeedbackPage() { return <FeedbackApp/>; }
