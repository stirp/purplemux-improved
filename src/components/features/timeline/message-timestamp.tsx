import dayjs from 'dayjs';
import { cn } from '@/lib/utils';

interface IMessageTimestampProps {
  timestamp: number;
  className?: string;
}

const MessageTimestamp = ({ timestamp, className }: IMessageTimestampProps) => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const date = dayjs(timestamp);
  if (!date.isValid()) return null;

  return (
    <time
      dateTime={date.toISOString()}
      title={date.format('YYYY-MM-DD HH:mm:ss Z')}
      className={cn('mt-1 block text-xs text-muted-foreground tabular-nums', className)}
    >
      {date.format('YYYY-MM-DD HH:mm:ss')}
    </time>
  );
};

export default MessageTimestamp;
