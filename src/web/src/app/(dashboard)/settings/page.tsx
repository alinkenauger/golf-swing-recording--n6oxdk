'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { debounce } from 'lodash';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useAuth } from '../../hooks/useAuth';
import { UserService } from '../../services/user.service';

// Initialize UserService
const userService = new UserService(apiClient, {
  maxRetries: 3,
  requestTimeout: 30000,
  cacheExpiry: 300000
});

interface SettingsFormData {
  firstName: string;
  lastName: string;
  email: string;
  emailNotifications: boolean;
  theme: 'light' | 'dark' | 'system';
  language: string;
  profileVisibility: 'public' | 'private' | 'connections';
  showActivity: boolean;
}

const SettingsPage: React.FC = () => {
  const { user, isAuthenticated, validateSession } = useAuth();

  // Form state management
  const [formData, setFormData] = useState<SettingsFormData>({
    firstName: '',
    lastName: '',
    email: '',
    emailNotifications: true,
    theme: 'system',
    language: 'en',
    profileVisibility: 'public',
    showActivity: true
  });

  // UI state management
  const [loading, setLoading] = useState({
    profile: false,
    preferences: false,
    delete: false
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Initialize form data from user profile
  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        email: user.email,
        emailNotifications: user.preferences.emailNotifications,
        theme: user.preferences.theme,
        language: user.preferences.language,
        profileVisibility: user.preferences.privacySettings.profileVisibility,
        showActivity: user.preferences.privacySettings.showActivity
      });
    }
  }, [user]);

  // Form validation
  const validateForm = useCallback((data: Partial<SettingsFormData>): Record<string, string> => {
    const newErrors: Record<string, string> = {};

    if ('firstName' in data && (!data.firstName || data.firstName.length < 2)) {
      newErrors.firstName = 'First name must be at least 2 characters';
    }

    if ('lastName' in data && (!data.lastName || data.lastName.length < 2)) {
      newErrors.lastName = 'Last name must be at least 2 characters';
    }

    if ('email' in data && (!data.email || !/^[^@]+@[^@]+\.[^@]+$/.test(data.email))) {
      newErrors.email = 'Please enter a valid email address';
    }

    return newErrors;
  }, []);

  // Debounced auto-save for preferences
  const debouncedPreferencesUpdate = useMemo(
    () =>
      debounce(async (preferences: Partial<SettingsFormData>) => {
        try {
          await validateSession();
          await userService.updatePreferences({
            emailNotifications: preferences.emailNotifications,
            theme: preferences.theme,
            language: preferences.language,
            privacySettings: {
              profileVisibility: preferences.profileVisibility,
              showActivity: preferences.showActivity
            }
          });
        } catch (error) {
          console.error('Failed to update preferences:', error);
        }
      }, 500),
    [validateSession]
  );

  // Handle form field changes
  const handleChange = useCallback((field: keyof SettingsFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setTouched(prev => ({ ...prev, [field]: true }));
    setIsDirty(true);

    // Auto-save preferences
    if (['theme', 'language', 'emailNotifications', 'profileVisibility', 'showActivity'].includes(field)) {
      debouncedPreferencesUpdate({ [field]: value });
    }
  }, [debouncedPreferencesUpdate]);

  // Handle profile update
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(prev => ({ ...prev, profile: true }));
      await validateSession();

      const validationErrors = validateForm(formData);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }

      await userService.updateProfile({
        firstName: formData.firstName,
        lastName: formData.lastName
      });

      setIsDirty(false);
      setErrors({});
    } catch (error) {
      console.error('Profile update failed:', error);
      setErrors({ submit: 'Failed to update profile. Please try again.' });
    } finally {
      setLoading(prev => ({ ...prev, profile: false }));
    }
  };

  // Handle account deletion
  const handleAccountDeletion = async () => {
    if (!window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(prev => ({ ...prev, delete: true }));
      await validateSession();

      const confirmationToken = window.prompt('Please type "DELETE" to confirm account deletion');
      if (confirmationToken !== 'DELETE') {
        throw new Error('Invalid confirmation');
      }

      await userService.deleteAccount({
        confirmationToken,
        exportData: true,
        reason: 'User requested deletion'
      });

      window.location.href = '/';
    } catch (error) {
      console.error('Account deletion failed:', error);
      setErrors({ delete: 'Failed to delete account. Please try again.' });
    } finally {
      setLoading(prev => ({ ...prev, delete: false }));
    }
  };

  if (!isAuthenticated) {
    return <div>Please log in to access settings.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-8">Account Settings</h1>

      <section className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-6">Profile Information</h2>
        <form onSubmit={handleProfileUpdate} className="space-y-6">
          <Input
            id="firstName"
            name="firstName"
            type="text"
            label="First Name"
            value={formData.firstName}
            error={errors.firstName}
            required
            onChange={(value) => handleChange('firstName', value)}
            aria-invalid={!!errors.firstName}
          />

          <Input
            id="lastName"
            name="lastName"
            type="text"
            label="Last Name"
            value={formData.lastName}
            error={errors.lastName}
            required
            onChange={(value) => handleChange('lastName', value)}
            aria-invalid={!!errors.lastName}
          />

          <Input
            id="email"
            name="email"
            type="email"
            label="Email"
            value={formData.email}
            error={errors.email}
            disabled
            onChange={(value) => handleChange('email', value)}
            helpText="Contact support to change your email address"
          />

          <Button
            type="submit"
            variant="primary"
            loading={loading.profile}
            disabled={!isDirty || loading.profile}
          >
            Save Changes
          </Button>
        </form>
      </section>

      <section className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-6">Preferences</h2>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <label htmlFor="emailNotifications" className="font-medium">
              Email Notifications
            </label>
            <input
              id="emailNotifications"
              type="checkbox"
              checked={formData.emailNotifications}
              onChange={(e) => handleChange('emailNotifications', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
          </div>

          <div>
            <label htmlFor="theme" className="block font-medium mb-2">
              Theme
            </label>
            <select
              id="theme"
              value={formData.theme}
              onChange={(e) => handleChange('theme', e.target.value)}
              className="w-full rounded-md border border-gray-300 p-2"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </div>

          <div>
            <label htmlFor="language" className="block font-medium mb-2">
              Language
            </label>
            <select
              id="language"
              value={formData.language}
              onChange={(e) => handleChange('language', e.target.value)}
              className="w-full rounded-md border border-gray-300 p-2"
            >
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
            </select>
          </div>

          <div>
            <label htmlFor="profileVisibility" className="block font-medium mb-2">
              Profile Visibility
            </label>
            <select
              id="profileVisibility"
              value={formData.profileVisibility}
              onChange={(e) => handleChange('profileVisibility', e.target.value)}
              className="w-full rounded-md border border-gray-300 p-2"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
              <option value="connections">Connections Only</option>
            </select>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-red-600 mb-6">Danger Zone</h2>
        <div className="space-y-4">
          <p className="text-gray-600">
            Once you delete your account, there is no going back. Please be certain.
          </p>
          {errors.delete && (
            <p className="text-red-500 text-sm" role="alert">
              {errors.delete}
            </p>
          )}
          <Button
            variant="danger"
            loading={loading.delete}
            onClick={handleAccountDeletion}
          >
            Delete Account
          </Button>
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;