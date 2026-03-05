import { clsx } from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import { Children, forwardRef, isValidElement, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, SelectHTMLAttributes } from 'react';

interface ParsedOption {
  value: string;
  label: ReactNode;
  textLabel: string;
  disabled: boolean;
}

function readOptionText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(readOptionText).join('');
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return readOptionText(props.children);
  }
  return '';
}

function parseOptions(nodes: ReactNode): ParsedOption[] {
  const options: ParsedOption[] = [];

  const visit = (children: ReactNode) => {
    Children.forEach(children, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === 'option') {
        const props = child.props as {
          value?: string | number;
          children?: ReactNode;
          disabled?: boolean;
        };
        const rawValue = props.value ?? readOptionText(props.children);
        options.push({
          value: String(rawValue ?? ''),
          label: props.children,
          textLabel: readOptionText(props.children),
          disabled: Boolean(props.disabled),
        });
        return;
      }
      if (child.type === 'optgroup') {
        const props = child.props as { children?: ReactNode };
        visit(props.children);
      }
    });
  };

  visit(nodes);
  return options;
}

function createSyntheticChangeEvent(nextValue: string, name?: string): ChangeEvent<HTMLSelectElement> {
  const target = { value: nextValue, name: name ?? '' } as EventTarget & HTMLSelectElement;
  return {
    target,
    currentTarget: target,
  } as ChangeEvent<HTMLSelectElement>;
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  (
    {
      className,
      children,
      value,
      defaultValue,
      onChange,
      disabled,
      name,
      id,
      required,
      ...rest
    },
    ref,
  ) => {
    const listId = useId();
    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const options = useMemo(() => parseOptions(children), [children]);
    const isControlled = value !== undefined;
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [innerValue, setInnerValue] = useState(() => {
      if (defaultValue !== undefined) return String(defaultValue);
      const firstEnabled = options.find((item) => !item.disabled);
      return firstEnabled?.value ?? '';
    });

    const firstEnabledValue = options.find((item) => !item.disabled)?.value ?? '';
    const currentValue = isControlled ? String(value ?? '') : innerValue;
    const hasCurrentValue = options.some((item) => item.value === currentValue);
    const resolvedValue = hasCurrentValue ? currentValue : firstEnabledValue;
    const selectedOption = options.find((item) => item.value === resolvedValue) ?? options[0];

    useEffect(() => {
      if (!open) return;

      const handlePointerDown = (event: PointerEvent) => {
        if (!rootRef.current?.contains(event.target as Node)) {
          setOpen(false);
        }
      };

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setOpen(false);
          triggerRef.current?.focus();
        }
      };

      document.addEventListener('pointerdown', handlePointerDown);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('pointerdown', handlePointerDown);
        document.removeEventListener('keydown', handleEscape);
      };
    }, [open]);

    const changeValue = (nextValue: string) => {
      if (!isControlled) {
        setInnerValue(nextValue);
      }
      onChange?.(createSyntheticChangeEvent(nextValue, name));
    };

    const selectedEnabledIndex = options.findIndex((item) => item.value === resolvedValue && !item.disabled);

    const findNextEnabledIndex = (startIndex: number, direction: 1 | -1): number => {
      if (options.length === 0) return -1;
      let index = startIndex;
      for (let i = 0; i < options.length; i += 1) {
        index = (index + direction + options.length) % options.length;
        if (!options[index].disabled) return index;
      }
      return -1;
    };

    const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!open) {
          setActiveIndex(selectedEnabledIndex);
          setOpen(true);
          return;
        }
        setActiveIndex((current) => findNextEnabledIndex(current < 0 ? 0 : current, 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!open) {
          setActiveIndex(selectedEnabledIndex);
          setOpen(true);
          return;
        }
        setActiveIndex((current) => findNextEnabledIndex(current < 0 ? options.length - 1 : current, -1));
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        if (activeIndex >= 0 && options[activeIndex] && !options[activeIndex].disabled) {
          changeValue(options[activeIndex].value);
          setOpen(false);
        }
        return;
      }

      if (event.key === 'Tab') {
        setOpen(false);
      }
    };

    return (
      <div ref={rootRef} className="relative w-full">
        <select
          ref={ref}
          value={resolvedValue}
          name={name}
          id={id}
          required={required}
          disabled={disabled}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={() => {}}
          {...rest}
        >
          {children}
        </select>

        <button
          ref={triggerRef}
          type="button"
          id={id ? `${id}-trigger` : undefined}
          role="combobox"
          aria-controls={listId}
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setOpen((current) => {
              const nextOpen = !current;
              if (nextOpen) {
                setActiveIndex(selectedEnabledIndex);
              }
              return nextOpen;
            });
          }}
          onKeyDown={handleTriggerKeyDown}
          className={clsx(
            'flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition hover:border-slate-300 focus:border-dopamine-blue focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className="truncate text-left">{selectedOption?.label ?? ''}</span>
          <ChevronDown size={16} className={clsx('text-slate-400 transition', open && 'rotate-180')} />
        </button>

        {open ? (
          <div
            id={listId}
            role="listbox"
            aria-labelledby={id ? `${id}-trigger` : undefined}
            className="absolute z-[80] mt-2 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-slate-900/5"
          >
            {options.map((option, index) => {
              const isSelected = option.value === resolvedValue;
              const isActive = index === activeIndex;
              return (
                <button
                  key={`${option.value}_${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    if (option.disabled) return;
                    changeValue(option.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={clsx(
                    'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition',
                    option.disabled
                      ? 'cursor-not-allowed text-slate-300'
                      : isActive
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-700 hover:bg-slate-50',
                  )}
                  title={option.textLabel}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected ? <Check size={14} className="text-dopamine-blue" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  },
);

Select.displayName = 'Select';
