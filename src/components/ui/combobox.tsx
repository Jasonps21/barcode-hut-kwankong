"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  /** Nama field untuk form action berbasis FormData (hidden input). */
  name?: string;
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Bila diisi, user bisa mengetik nilai baru yang belum ada di `options`. */
  onCreate?: (label: string) => void;
  createLabel?: (input: string) => string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export function Combobox({
  name,
  options,
  value,
  onChange,
  placeholder = "Pilih...",
  searchPlaceholder = "Cari...",
  emptyText = "Tidak ditemukan.",
  onCreate,
  createLabel = (input) => `Tambah "${input}"`,
  disabled,
  required,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selected = options.find((o) => o.value === value);
  const trimmedSearch = search.trim();
  const canCreate =
    !!onCreate &&
    trimmedSearch.length > 0 &&
    !options.some((o) => o.label.toLowerCase() === trimmedSearch.toLowerCase());

  function handleSelect(val: string) {
    onChange(val);
    setSearch("");
    setOpen(false);
  }

  function handleCreate() {
    if (!onCreate || !trimmedSearch) return;
    onCreate(trimmedSearch);
    setSearch("");
    setOpen(false);
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[--radix-popover-trigger-width] overflow-hidden rounded-md border bg-popover p-0 text-popover-foreground shadow-md"
        >
          <CommandPrimitive shouldFilter>
            <div className="flex items-center border-b px-3">
              <CommandPrimitive.Input
                value={search}
                onValueChange={setSearch}
                placeholder={searchPlaceholder}
                className="flex h-9 w-full rounded-md bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <CommandPrimitive.List className="max-h-60 overflow-y-auto overflow-x-hidden p-1">
              <CommandPrimitive.Empty className="py-4 text-center text-sm text-muted-foreground">
                {canCreate ? null : emptyText}
              </CommandPrimitive.Empty>
              {canCreate && (
                <CommandPrimitive.Item
                  value={`__create__${trimmedSearch}`}
                  onSelect={handleCreate}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary aria-selected:bg-accent"
                >
                  <Plus className="h-4 w-4" />
                  {createLabel(trimmedSearch)}
                </CommandPrimitive.Item>
              )}
              {options.map((option) => (
                <CommandPrimitive.Item
                  key={option.value}
                  value={option.label}
                  onSelect={() => handleSelect(option.value)}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm aria-selected:bg-accent"
                >
                  <Check className={cn("h-4 w-4", value === option.value ? "opacity-100" : "opacity-0")} />
                  {option.label}
                </CommandPrimitive.Item>
              ))}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
