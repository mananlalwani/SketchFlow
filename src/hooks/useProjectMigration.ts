// Hook to handle automatic migration of guest projects when user signs in
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { projectMigrationService } from '@/services/ProjectMigrationService';
import { useToast } from '@/hooks/use-toast';

export function useProjectMigration() {
  const { isAuthenticated, guestId, getToken } = useAuthStore();
  const { toast } = useToast();
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationComplete, setMigrationComplete] = useState(false);
  const hasAttemptedMigration = useRef(false);

  useEffect(() => {
    const attemptMigration = async () => {
      // Only attempt migration once per session
      if (hasAttemptedMigration.current) {
        return;
      }

      // Wait for auth to be loaded
      if (!isAuthenticated) {
        return;
      }

      // Check if migration is needed
      const needsMigration = await projectMigrationService.needsMigration(
        isAuthenticated,
        guestId
      );

      if (!needsMigration) {
        return;
      }

      // Mark as attempted to prevent duplicate migrations
      hasAttemptedMigration.current = true;
      setIsMigrating(true);

      try {
        const token = await getToken();
        if (!token) {
          console.error('No token available for migration');
          return;
        }

        const result = await projectMigrationService.migrateProjects(token);

        if (result.success) {
          setMigrationComplete(true);
          
          if (result.migratedCount > 0) {
            toast({
              title: 'Projects migrated!',
              description: `Successfully migrated ${result.migratedCount} ${result.migratedCount === 1 ? 'project' : 'projects'} to your account.`,
              duration: 5000,
            });
          }
        }

        // Show warnings if some projects failed
        if (result.failedCount > 0) {
          toast({
            title: 'Some projects could not be migrated',
            description: `${result.failedCount} ${result.failedCount === 1 ? 'project' : 'projects'} failed to migrate. They remain in local storage.`,
            variant: 'destructive',
            duration: 7000,
          });
        }

      } catch (error) {
        console.error('Migration error:', error);
        toast({
          title: 'Migration failed',
          description: 'Could not migrate your local projects. They remain in local storage.',
          variant: 'destructive',
          duration: 5000,
        });
      } finally {
        setIsMigrating(false);
      }
    };

    attemptMigration();
  }, [isAuthenticated, guestId, getToken, toast]);

  return {
    isMigrating,
    migrationComplete,
  };
}
