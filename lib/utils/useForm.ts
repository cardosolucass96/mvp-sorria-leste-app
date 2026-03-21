'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseFormOptions<T extends Record<string, unknown>> {
  initialValues: T;
  validate?: (values: T) => FormErrors<T>;
  onSubmit: (values: T) => Promise<void> | void;
}

export type FormErrors<T> = Partial<Record<keyof T, string>>;

export interface UseFormReturn<T extends Record<string, unknown>> {
  values: T;
  errors: FormErrors<T>;
  touched: Partial<Record<keyof T, boolean>>;
  isDirty: boolean;
  isSubmitting: boolean;
  isValid: boolean;
  setValue: (field: keyof T, value: T[keyof T]) => void;
  setValues: (values: Partial<T>) => void;
  setError: (field: keyof T, message: string) => void;
  clearErrors: () => void;
  handleBlur: (field: keyof T) => void;
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
  reset: (newValues?: T) => void;
}

export function useForm<T extends Record<string, unknown>>({
  initialValues,
  validate,
  onSubmit,
}: UseFormOptions<T>): UseFormReturn<T> {
  const [values, setValuesState] = useState<T>(initialValues);
  const [errors, setErrors] = useState<FormErrors<T>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initialValuesRef = useRef(initialValues);

  // Track dirty state
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValuesRef.current);

  // Validate on demand
  const runValidation = useCallback(
    (vals: T): FormErrors<T> => {
      if (!validate) return {};
      return validate(vals);
    },
    [validate]
  );

  const isValid = Object.keys(runValidation(values)).length === 0;

  const setValue = useCallback((field: keyof T, value: T[keyof T]) => {
    setValuesState((prev) => ({ ...prev, [field]: value }));
    // Clear field error when user starts typing
    setErrors((prev) => {
      if (prev[field]) {
        const next = { ...prev };
        delete next[field];
        return next;
      }
      return prev;
    });
  }, []);

  const setValues = useCallback((partial: Partial<T>) => {
    setValuesState((prev) => ({ ...prev, ...partial }));
  }, []);

  const setError = useCallback((field: keyof T, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const handleBlur = useCallback(
    (field: keyof T) => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      // Validate single field on blur
      if (validate) {
        const allErrors = validate(values);
        if (allErrors[field]) {
          setErrors((prev) => ({ ...prev, [field]: allErrors[field] }));
        }
      }
    },
    [validate, values]
  );

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();

      // Mark all fields as touched
      const allTouched: Partial<Record<keyof T, boolean>> = {};
      for (const key of Object.keys(values) as (keyof T)[]) {
        allTouched[key] = true;
      }
      setTouched(allTouched);

      // Validate
      const validationErrors = runValidation(values);
      setErrors(validationErrors);

      if (Object.keys(validationErrors).length > 0) {
        return;
      }

      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } finally {
        setIsSubmitting(false);
      }
    },
    [values, runValidation, onSubmit]
  );

  const reset = useCallback(
    (newValues?: T) => {
      const resetTo = newValues ?? initialValuesRef.current;
      setValuesState(resetTo);
      setErrors({});
      setTouched({});
      if (newValues) {
        initialValuesRef.current = newValues;
      }
    },
    []
  );

  // Warn about unsaved changes (beforeunload)
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  return {
    values,
    errors,
    touched,
    isDirty,
    isSubmitting,
    isValid,
    setValue,
    setValues,
    setError,
    clearErrors,
    handleBlur,
    handleSubmit,
    reset,
  };
}
