// Service to handle migration of guest projects when user signs in
import { localProjectsService } from '@/lib/localProjects';
import { createProject } from '@/lib/api';

export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  failedCount: number;
  errors: string[];
}

const MIGRATION_STATUS_KEY = 'project-migration-status';
const LAST_GUEST_ID_KEY = 'last-guest-id';

export class ProjectMigrationService {
  private isMigrating = false;

  /**
   * Checks if migration is needed (user was guest and now is authenticated)
   */
  async needsMigration(isAuthenticated: boolean, currentGuestId: string | null): Promise<boolean> {
    if (!isAuthenticated) {
      // If user is a guest, store their guest ID for future migration detection
      if (currentGuestId) {
        localStorage.setItem(LAST_GUEST_ID_KEY, currentGuestId);
      }
      return false;
    }

    // User is authenticated - check if they were previously a guest
    const lastGuestId = localStorage.getItem(LAST_GUEST_ID_KEY);

    if (!lastGuestId) {
      return false; // User was never a guest in this browser
    }

    // Check if we already migrated for this guest
    const migrationStatus = localStorage.getItem(MIGRATION_STATUS_KEY);
    if (migrationStatus === lastGuestId) {
      return false; // Already migrated this guest's projects
    }

    // Check if there are any local projects to migrate
    const localProjects = await localProjectsService.getAllForMigration();
    return localProjects.length > 0;
  }

  /**
   * Migrates all guest projects to authenticated user's account
   */
  async migrateProjects(token: string): Promise<MigrationResult> {
    if (this.isMigrating) {
      throw new Error('Migration already in progress');
    }

    this.isMigrating = true;

    const result: MigrationResult = {
      success: false,
      migratedCount: 0,
      failedCount: 0,
      errors: [],
    };

    try {
      // Get all local projects
      const localProjects = await localProjectsService.getAllForMigration();

      if (localProjects.length === 0) {
        result.success = true;
        return result;
      }

      // Migrate sequentially and remove each successful source record. If a later
      // upload fails, a future retry sees only the projects that still need work.
      for (const project of localProjects) {
        try {
          await createProject(project.title, project.data, token, project.thumbnail || null);
          const removed = await localProjectsService.delete(project.id);
          if (!removed) throw new Error('Migrated project could not be removed from local storage');
          result.migratedCount++;
        } catch (error) {
          result.failedCount++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Failed to migrate "${project.title}": ${errorMsg}`);
          console.error(`Failed to migrate project ${project.title}:`, error);
        }
      }

      // If all projects migrated successfully, clear local storage
      if (result.failedCount === 0) {
        const lastGuestId = localStorage.getItem(LAST_GUEST_ID_KEY);
        await localProjectsService.clearAll();

        // Mark migration as complete for this guest
        if (lastGuestId) {
          localStorage.setItem(MIGRATION_STATUS_KEY, lastGuestId);
        }
      } else {
        console.warn(
          `Migration completed with ${result.failedCount} failures. Local projects retained.`,
        );
      }

      result.success = result.failedCount === 0;
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Migration failed: ${errorMsg}`);
      console.error('Migration process failed:', error);
      return result;
    } finally {
      this.isMigrating = false;
    }
  }

  /**
   * Cleans up migration metadata (for testing or manual cleanup)
   */
  clearMigrationStatus(): void {
    localStorage.removeItem(MIGRATION_STATUS_KEY);
    localStorage.removeItem(LAST_GUEST_ID_KEY);
  }
}

export const projectMigrationService = new ProjectMigrationService();
