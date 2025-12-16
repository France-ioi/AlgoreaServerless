export default async (): Promise<void> => {
  const dynamoProcess = (global as any).__DYNAMODB_PROCESS__;

  if (dynamoProcess) {
    console.log('Stopping DynamoDB Local...');
    dynamoProcess.kill('SIGTERM');

    // Wait for process to terminate
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
};

