namespace UnitTestName
{
    using Microsoft.Azure.Workflows.UnitTesting;
    using Microsoft.Azure.Workflows.UnitTesting.Definitions;
    using Newtonsoft.Json.Linq;
    using Microsoft.VisualStudio.TestTools.UnitTesting;
    using System.IO;
    using System.Collections.Generic;

    [TestClass]
    /// <summary>
    /// This class contains unit tests for your Logic App workflow generated from a run.
    /// It demonstrates how to execute the workflow with mocked data and verify the results.
    /// </summary>
    public class UnitTestName
    {
        // Private properties for workflow definition, connections, parameters, local settings, and mock path
        private string workflowDefinitionPath;
        private string connectionsPath;
        private string parametersPath;
        private string localSettingsPath;
        private string mockPath;

        // Private property for mock data
        private JObject mockData;

        /// <summary>
        /// Initializes a new instance of the <see cref="UnitTestName"/> class.
        /// Sets up the paths to the workflow definition, connections, parameters, local settings, and mock data.
        /// </summary>
        public UnitTestName()
        {
            this.workflowDefinitionPath = "../MyLogicApp/MyWorkflow/workflow.json";
            this.connectionsPath = "../MyLogicApp/connections.json";
            this.parametersPath = "../MyLogicApp/parameters.json";
            this.localSettingsPath = "../MyLogicApp/local.settings.json";
            this.mockPath = "MyRun-mock.json";
            this.mockData = JObject.Parse(File.ReadAllText(mockPath));
        }

        /// <summary>
        /// Reads the trigger mock data from the mock JSON file and deserializes it into a <see cref="TriggerMock"/> object.
        /// </summary>
        /// <returns>The trigger mock data.</returns>
        private TriggerMock GetTriggerMock()
        {
            return this.mockData["triggerMocks"]["When_a_HTTP_request_is_received"].ToObject<TriggerMock>();
        }

        /// <summary>
        /// Reads the action mocks from the mock JSON file and deserializes them into a dictionary of action names to <see cref="ActionMock"/> objects.
        /// </summary>
        /// <returns>A dictionary of action mocks.</returns>
        private Dictionary<string, ActionMock> GetActionMocks()
        {
            return this.mockData["actionMocks"].ToObject<Dictionary<string, ActionMock>>();
        }

        [TestMethod]
        /// <summary>
        /// Sample unit test to demonstrate how to execute a Logic App workflow with mocked data and verify successful execution.
        /// This serves as an example of how you can author and execute your own unit tests.
        /// </summary>
        public void MyLogicApp_Execute_SUCCESS()
        {
            // PREPARE
            // Initialize the trigger mock and action mocks from the mock data.
            // The trigger mock simulates the trigger input to the workflow.
            // The action mocks simulate the outputs of actions within the workflow.
            var triggerMock = this.GetTriggerMock();
            var actionMocks = this.GetActionMocks();

            // ACT
            // Create an instance of the UnitTestExecutor with the workflow definition and configurations.
            // Execute the workflow asynchronously using the trigger and action mocks.
            // The testRun object contains the results of the workflow execution.
            var executor = new UnitTestExecutor(this.workflowDefinitionPath, this.connectionsPath, this.parametersPath, this.localSettingsPath);
            var testRun = executor.ExecuteWorkflowAsync(triggerMock, actionMocks).Result;

            // ASSERT
            // Verify that the workflow executed successfully.
            // You can use MSTest assertions to validate the test run results.
            Assert.IsNotNull(testRun);
            Assert.AreEqual(TestWorkflowStatus.Succeeded, testRun.Status);
        }

        [TestMethod]
        /// <summary>
        /// Sample unit test to demonstrate how to execute a Logic App workflow with a simulated action failure and verify error handling.
        /// This serves as an example of how you can author and execute tests that expect failures.
        /// </summary>
        public void MyLogicApp_Execute_FAILURE()
        {
            // PREPARE
            // Initialize the trigger mock and action mocks from the mock data.
            var triggerMock = this.GetTriggerMock();
            var actionMocks = this.GetActionMocks();

            // Simulate a failure in the "ProcessOrder" action by setting its status to Failed and providing a mock output.
            actionMocks["ProcessOrder"] = new ActionMock("ProcessOrder", TestWorkflowStatus.Failed, onGetActionOutputsCallback: this.MockProcessOrderOutputCallback);

            // ACT
            // Execute the workflow with the modified action mocks to simulate a failure in the specified action.
            var executor = new UnitTestExecutor(this.workflowDefinitionPath, this.connectionsPath, this.parametersPath, this.localSettingsPath);
            var testRun = executor.ExecuteWorkflowAsync(triggerMock, actionMocks).Result;

            // ASSERT
            // Verify that the workflow execution failed as expected.
            Assert.IsNotNull(testRun);
            Assert.AreEqual(TestWorkflowStatus.Failed, testRun.Status);
        }

        #region Mock generator helpers

        /// <summary>
        /// Provides mock output for the "ProcessOrder" action when simulating a failure.
        /// </summary>
        /// <param name="context">The test execution context.</param>
        /// <returns>A <see cref="JToken"/> representing the action's output.</returns>
        public JToken MockProcessOrderOutputCallback(TestExecutionContext context)
        {
            // Simulate a failure output for the "ProcessOrder" action.
            // Return an error response with status code 400 and error message.
            return JObject.Parse(@"{
                'statusCode': '400',
                'body': {
                    'error': 'Invalid order data.'
                }
            }");
        }

        #endregion
    }
}
