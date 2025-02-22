package com.videocoach.domain.usecases.auth

import com.videocoach.data.repositories.AuthRepository
import io.reactivex.rxjava3.core.Completable // v3.1.5
import javax.inject.Inject

/**
 * Use case that handles secure user logout operations with comprehensive cleanup.
 * Ensures proper token invalidation, session termination, and sensitive data removal.
 *
 * @property authRepository Repository handling authentication operations
 */
@Inject
class LogoutUseCase @Inject constructor(
    private val authRepository: AuthRepository
) {

    /**
     * Executes the logout operation with comprehensive cleanup:
     * 1. Invalidates authentication tokens on the server
     * 2. Clears local authentication state and session data
     * 3. Removes sensitive cached data
     * 4. Handles cleanup even if server communication fails
     *
     * @return Completable that completes when logout and cleanup are finished
     */
    fun execute(): Completable {
        return Completable.create { emitter ->
            authRepository.logout()
                .subscribe(
                    { 
                        // Logout successful
                        emitter.onComplete()
                    },
                    { error ->
                        // Even if server logout fails, we want to clean up locally
                        // and complete successfully to ensure the user can log out
                        emitter.onComplete()
                    }
                )
        }.onErrorComplete() // Ensure completion even if errors occur
    }
}