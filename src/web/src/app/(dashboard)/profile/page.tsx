'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import debounce from 'lodash/debounce';
import { User, UserProfile, UserPreferences } from '@/types/user';
import { UserService } from '@/services/user.service';
import { Button } from '@/components/common/Button';

// Form data interface with role-specific fields
interface ProfileFormData {
  firstName: string;
  lastName: string;
  bio: string | null;
  location: string | null;
  phoneNumber: string | null;
  timezone: string;
  socialLinks: {
    platform: string;
    url: string;
  }[];
  coachSpecialties?: string[];
  athleteLevel?: 'beginner' | 'intermediate' | 'advanced' | 'professional';
}

// Component state interface
interface ProfileState {
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  successMessage: string | null;
}

const userService = new UserService(null, {
  maxRetries: 3,
  requestTimeout: 30000,
});

export default function ProfilePage() {
  // Component state
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<ProfileState>({
    isLoading: true,
    isSaving: false,
    error: null,
    successMessage: null,
  });

  // Form setup with validation
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ProfileFormData>();

  // Load user data
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const userData = await userService.getCurrentUser();
        setUser(userData);
        
        // Populate form with user data
        setValue('firstName', userData.profile.firstName);
        setValue('lastName', userData.profile.lastName);
        setValue('bio', userData.profile.bio);
        setValue('location', userData.profile.location);
        setValue('phoneNumber', userData.profile.phoneNumber);
        setValue('timezone', userData.profile.timezone);
        setValue('socialLinks', userData.profile.socialLinks);
        
        // Set role-specific fields
        if (userData.role === 'COACH') {
          setValue('coachSpecialties', (userData.profile as any).specialties);
        } else if (userData.role === 'ATHLETE') {
          setValue('athleteLevel', (userData.profile as any).skillLevel);
        }
        
        setState(prev => ({ ...prev, isLoading: false }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to load profile data',
        }));
      }
    };

    loadUserProfile();
  }, [setValue]);

  // Real-time field validation
  const validateField = useCallback(
    debounce(async (field: string, value: string) => {
      try {
        await userService.validateField(field, value);
      } catch (error) {
        // Handle validation error
      }
    }, 500),
    []
  );

  // Watch form changes for validation
  useEffect(() => {
    const subscription = watch((value, { name }) => {
      if (name) {
        validateField(name, value[name] as string);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, validateField]);

  // Handle profile update
  const handleProfileUpdate = async (data: ProfileFormData) => {
    setState(prev => ({ ...prev, isSaving: true, error: null }));
    
    try {
      const updatedProfile: Partial<UserProfile> = {
        firstName: data.firstName,
        lastName: data.lastName,
        bio: data.bio,
        location: data.location,
        phoneNumber: data.phoneNumber,
        timezone: data.timezone,
        socialLinks: data.socialLinks,
      };

      // Add role-specific data
      if (user?.role === 'COACH' && data.coachSpecialties) {
        (updatedProfile as any).specialties = data.coachSpecialties;
      } else if (user?.role === 'ATHLETE' && data.athleteLevel) {
        (updatedProfile as any).skillLevel = data.athleteLevel;
      }

      const updatedUser = await userService.updateProfile(updatedProfile);
      setUser(updatedUser);
      
      setState(prev => ({
        ...prev,
        isSaving: false,
        successMessage: 'Profile updated successfully',
      }));

      // Clear success message after 3 seconds
      setTimeout(() => {
        setState(prev => ({ ...prev, successMessage: null }));
      }, 3000);
    } catch (error) {
      setState(prev => ({
        ...prev,
        isSaving: false,
        error: 'Failed to update profile',
      }));
    }
  };

  if (state.isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Profile Settings</h1>

      {state.error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-600">
          {state.error}
        </div>
      )}

      {state.successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md text-green-600">
          {state.successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit(handleProfileUpdate)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              First Name
            </label>
            <input
              type="text"
              {...register('firstName', { required: 'First name is required' })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            />
            {errors.firstName && (
              <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Last Name
            </label>
            <input
              type="text"
              {...register('lastName', { required: 'Last name is required' })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            />
            {errors.lastName && (
              <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Bio
          </label>
          <textarea
            {...register('bio')}
            rows={4}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Location
          </label>
          <input
            type="text"
            {...register('location')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        {user?.role === 'COACH' && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Specialties
            </label>
            <select
              multiple
              {...register('coachSpecialties')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            >
              <option value="strength">Strength Training</option>
              <option value="cardio">Cardio</option>
              <option value="flexibility">Flexibility</option>
              <option value="nutrition">Nutrition</option>
              <option value="sports">Sports Specific</option>
            </select>
          </div>
        )}

        {user?.role === 'ATHLETE' && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Skill Level
            </label>
            <select
              {...register('athleteLevel')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="professional">Professional</option>
            </select>
          </div>
        )}

        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.history.back()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={state.isSaving}
            disabled={state.isSaving}
          >
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}