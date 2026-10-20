import { useFormatter, useTranslations } from 'next-intl';
import { Cpu, MemoryStick, X } from 'lucide-react';
import useSystemResources from '@/hooks/use-system-resources';
import useConfigStore from '@/hooks/use-config-store';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle, PopoverDescription } from '@/components/ui/popover';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const percent = (value: number | null) => value === null ? '—' : `${Math.round(value)}%`;
const color = (value: number | null) => value !== null && value >= 90 ? 'text-ui-red' : value !== null && value >= 80 ? 'text-ui-amber' : 'text-muted-foreground';
const formatMemory = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;

const ResourceMonitor = ({ mobile }: { mobile: boolean }) => {
  const t = useTranslations('header.resources');
  const tc = useTranslations('common');
  const format = useFormatter();
  const { resources, error } = useSystemResources(true);
  const cpu = resources?.cpu ?? null;
  const memory = resources && resources.memory.total > 0 ? resources.memory.used / resources.memory.total * 100 : null;
  const status = (value: number | null) => value === null ? t('sampling') : value >= 90 ? t('high') : value >= 80 ? t('elevated') : t('normal');
  const trigger = (
    <Button
      variant="ghost"
      className={cn('shrink-0 tabular-nums', mobile ? 'h-11 w-24 flex-col gap-0 px-2 py-1 text-xs' : 'h-8 gap-3 px-2 text-xs')}
      aria-label={`${t('title')}: CPU ${percent(cpu)}, ${t('memory')} ${percent(memory)}${error ? `, ${t('unavailable')}` : ''}`}
    >
      <span className={cn('flex w-full items-center justify-between gap-1', color(cpu))}>
        {!mobile && <Cpu className="size-3.5" aria-hidden="true" />}
        <span>CPU</span><span className="min-w-8 text-right">{percent(cpu)}</span>
      </span>
      <span className={cn('flex w-full items-center justify-between gap-1', color(memory))}>
        {!mobile && <MemoryStick className="size-3.5" aria-hidden="true" />}
        <span>{t('memoryShort')}</span><span className="min-w-8 text-right">{percent(memory)}</span>
      </span>
    </Button>
  );
  const details = (
    <div className="space-y-4">
      {!resources ? (
        <p role="status" className="text-sm text-muted-foreground">{error ? t('unavailable') : t('loading')}</p>
      ) : (
        <>
          {[{ label: 'CPU', value: cpu }, { label: t('memory'), value: memory }].map(({ label, value }) => (
            <div key={label} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{label}</span>
                <span className={cn('text-xs', color(value))}>{status(value)}</span>
              </div>
              <p className="text-2xl font-semibold tabular-nums">{percent(value)}</p>
              <div className="h-1 bg-muted" aria-hidden="true">
                <div className={cn('h-full bg-current', color(value))} style={{ width: `${value ?? 0}%` }} />
              </div>
            </div>
          ))}
          <p className="text-sm tabular-nums">{t('usedTotal', { used: formatMemory(resources.memory.used), total: formatMemory(resources.memory.total) })}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{t(resources.memory.basis === 'available' ? 'availableBasis' : 'freeBasis')}</p>
          <p className="text-xs text-muted-foreground">{t('updated', { time: format.dateTime(resources.sampledAt, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })}</p>
        </>
      )}
    </div>
  );

  if (mobile) return (
    <Sheet>
      <SheetTrigger render={trigger} />
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[85dvh] gap-0 shadow-none pb-[env(safe-area-inset-bottom)]">
        <SheetHeader className="shrink-0 pr-16">
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('scope')}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 overflow-y-auto px-4 pb-4">{details}</div>
        <SheetClose render={<Button variant="ghost" size="icon" className="absolute right-2 top-2 size-11" />} aria-label={tc('close')}>
          <X className="size-4" />
        </SheetClose>
      </SheetContent>
    </Sheet>
  );

  return (
    <Popover>
      <PopoverTrigger render={trigger} />
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-4 shadow-none">
        <PopoverTitle>{t('title')}</PopoverTitle>
        <PopoverDescription>{t('scope')}</PopoverDescription>
        {details}
      </PopoverContent>
    </Popover>
  );
};

const SystemResources = ({ mobile = false }: { mobile?: boolean }) => {
  const enabled = useConfigStore((s) => s.systemResourcesEnabled);
  return enabled ? <ResourceMonitor mobile={mobile} /> : null;
};

export default SystemResources;
