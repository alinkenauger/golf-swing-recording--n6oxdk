import React, { useCallback, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react'; // v1.7.0
import classNames from 'classnames'; // v2.3.2
import { Button } from '../common/Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnOverlayClick?: boolean;
  initialFocus?: React.RefObject<HTMLElement>;
}

const getModalSizeClasses = (size: ModalProps['size'] = 'md'): string => {
  const sizeClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl'
  };

  return classNames(
    'w-full transform',
    'mx-auto',
    sizeClasses[size],
    'px-4 sm:px-0'
  );
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  size = 'md',
  children,
  footer,
  closeOnOverlayClick = true,
  initialFocus
}) => {
  // Handle escape key press
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [isOpen, onClose]);

  // Handle overlay click
  const handleOverlayClick = useCallback(() => {
    if (closeOnOverlayClick) {
      onClose();
    }
  }, [closeOnOverlayClick, onClose]);

  return (
    <Transition.Root show={isOpen} as={React.Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-50 overflow-y-auto"
        onClose={onClose}
        initialFocus={initialFocus}
      >
        <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
          {/* Background overlay */}
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Dialog.Overlay
              className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
              onClick={handleOverlayClick}
              aria-hidden="true"
            />
          </Transition.Child>

          {/* Center modal contents */}
          <span
            className="hidden sm:inline-block sm:h-screen sm:align-middle"
            aria-hidden="true"
          >
            &#8203;
          </span>

          {/* Modal panel */}
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <div
              className={classNames(
                getModalSizeClasses(size),
                'inline-block align-bottom bg-white',
                'rounded-lg text-left shadow-xl',
                'transform transition-all sm:align-middle'
              )}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? 'modal-title' : undefined}
            >
              {/* Header */}
              {title && (
                <div className="px-4 py-3 border-b border-gray-200">
                  <Dialog.Title
                    id="modal-title"
                    className="text-lg font-medium text-gray-900"
                  >
                    {title}
                  </Dialog.Title>
                </div>
              )}

              {/* Content */}
              <div className="px-4 py-4 max-h-[70vh] overflow-y-auto">
                {children}
              </div>

              {/* Footer */}
              {footer && (
                <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                  {footer}
                </div>
              )}

              {/* Default close button if no footer is provided */}
              {!footer && (
                <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 sm:flex sm:flex-row-reverse">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={onClose}
                    className="w-full sm:w-auto sm:ml-2"
                  >
                    Close
                  </Button>
                </div>
              )}
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
};

export type { ModalProps };