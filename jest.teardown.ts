import { execSync } from 'child_process';

export default async (): Promise<void> => {
  const dynamoProcess = (global as any).__DYNAMODB_PROCESS__;

  if (dynamoProcess) {
    console.log('Stopping DynamoDB Local...');
    try {
      dynamoProcess.kill('SIGKILL');
    } catch (error) {
      console.log('Failed to kill DynamoDB process via Node');
    }

    // Also kill any lingering Java DynamoDB processes
    try {
      execSync('pkill -9 -f "DynamoDBLocal"', { stdio: 'ignore' });
    } catch (error) {
      // Ignore if no processes found
    }

    // Wait briefly
    await new Promise(resolve => setTimeout(resolve, 500));
  }
};

