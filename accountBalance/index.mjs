import { DynamoDBClient, QueryCommand} from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const dynamoClient = new DynamoDBClient({ region: process.env.REGION_NAME });
const lambdaClient = new LambdaClient({ region: process.env.REGION_NAME });

export const handler = async (event) => {
    const tableName = process.env.TABLE_NAME;
    const LSIName = process.env.LSI_NAME;
    const targetLambdaName = process.env.FUNCTION_NAME;
    const userID = event.userID;

    if (!userID) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'UserID is required but not found.' })
        };
    }

    try {
        // Query for entry with current userID
        const queryParams = {
            TableName: tableName,
            IndexName: LSIName,
            KeyConditionExpression: 'userID = :userID AND begins_with(metadata, :prefix)',
            ExpressionAttributeValues: {
                ':userID': { S: userID },
                ':prefix': { S: 'ACCOUNT' }
            },
            ScanIndexForward: false, 
            Limit: 1 
        };
        // Create balance for new user
        const queryCommand = new QueryCommand(queryParams);
        const queryResult = await dynamoClient.send(queryCommand);
        console.log("Query Result: ", queryResult)
        if (queryResult.Items.length === 0) {
            const lambdaParams = {
                FunctionName: targetLambdaName,
                Payload: JSON.stringify({ userID, transactionAmount: 100000 }) 
            };

            try {
                const invokeCommand = new InvokeCommand(lambdaParams);
                const invokeResult = await lambdaClient.send(invokeCommand);

                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        message: 'No existing entry found. Invoked the target Lambda function.',
                        result: JSON.parse(Buffer.from(invokeResult.Payload).toString())
                    })
                };
            } catch (invokeError) {
                console.log('Error invoking target Lambda function:', invokeError);
                return {
                    statusCode: 500,
                    body: JSON.stringify({error: 'Error invoking target Lambda function.'})
                };
            }
        } else {
            //If a balance exists, return it
            const latestItem = queryResult.Items[0];
            const currentBalance = latestItem.balance ? parseFloat(latestItem.balance.N) : 0;

            return {
                statusCode: 200,
                body: JSON.stringify({ balance: currentBalance })
            };
        }
    } catch (error) {
        console.error('Error querying DynamoDB:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Error querying DynamoDB.' })
        };
    }
};
