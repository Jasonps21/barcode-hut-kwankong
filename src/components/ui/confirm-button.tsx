"use client";

import { Button, type ButtonProps } from "./button";

/**
 * Tombol submit yang meminta konfirmasi (window.confirm) sebelum form dikirim.
 * Untuk aksi destruktif seperti hapus, agar tidak terjadi salah klik.
 */
export function ConfirmButton({ message, children, onClick, ...props }: ButtonProps & { message: string }) {
  return (
    <Button
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      {children}
    </Button>
  );
}
