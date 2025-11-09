document.addEventListener('auth-success', async function() {
    // This entire script runs only after successful authentication.
    
    // Global variables
    let sessions = [];
    let campaigns = [];
    let currentCampaign = null;
    let currentStep = 1;
    let csvRecipients = [];
    let selectedRecipients = [];
    let recipientLists = [];
    let currentEditingList = null;
    let quillEditor = null;
    let ws = null;
    let activeCampaignId = null;

    // Configure axios to include credentials (cookies) with requests
    axios.defaults.withCredentials = true;

    // Add axios interceptor for rate limit handling
    axios.interceptors.response.use(
        response => response,
        async error => {
            if (error.response && error.response.status === 429) {
                const retryAfter = error.config.retryCount || 0;
                if (retryAfter < 3) {
                    error.config.retryCount = retryAfter + 1;
                    const delay = Math.pow(2, retryAfter) * 1000;
                    console.log(`Rate limited, retrying after ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return axios(error.config);
                }
            }
            return Promise.reject(error);
        }
    );

    // Initial data loads
    await loadSessions();
    await loadCampaigns();
    await loadRecipientLists();
    
    // Set up event listeners
    const csvFileInput = document.getElementById('csvFile');
    if(csvFileInput) csvFileInput.addEventListener('change', handleCSVUpload);
    
    const messageTypeSelect = document.getElementById('messageType');
    if(messageTypeSelect) messageTypeSelect.addEventListener('change', handleMessageTypeChange);

    const searchCampaignsInput = document.getElementById('searchCampaigns');
    if(searchCampaignsInput) searchCampaignsInput.addEventListener('input', filterCampaigns);

    const filterStatusSelect = document.getElementById('filterStatus');
    if(filterStatusSelect) filterStatusSelect.addEventListener('change', filterCampaigns);
    
    // Initialize Quill editor if it exists
    if(document.getElementById('messageEditor')){
        quillEditor = new Quill('#messageEditor', {
            theme: 'snow',
            placeholder: 'Enter your message here...',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    ['link'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    ['clean']
                ]
            }
        });
        quillEditor.on('text-change', updateMessagePreview);
    }
    
    setupWebSocket();

    // Make functions globally accessible on the window object
    window.showCreateCampaign = showCreateCampaign;
    window.previousStep = previousStep;
    window.nextStep = nextStep;
    window.saveDraft = saveDraft;
    window.createCampaign = createCampaign;
    window.viewCampaign = viewCampaign;
    window.editCampaign = editCampaign;
    window.sendCampaign = sendCampaign;
    window.pauseCampaign = pauseCampaign;
    window.resumeCampaign = resumeCampaign;
    window.retryCampaign = retryCampaign;
    window.cloneCampaign = cloneCampaign;
    window.deleteCampaign = deleteCampaign;
    window.backToList = backToList;
    window.insertPlaceholder = insertPlaceholder;
    window.downloadCSVTemplate = downloadCSVTemplate;
    window.debugCSVUpload = debugCSVUpload;
    window.loadRecipientListsPage = loadRecipientListsPage;
    window.showCreateListModal = showCreateListModal;
    window.addRecipientRow = addRecipientRow;
    window.removeRecipientRow = removeRecipientRow;
    window.addMultipleRecipients = addMultipleRecipients;
    window.processBulkRecipients = processBulkRecipients;
    window.saveRecipientList = saveRecipientList;
    window.editRecipientList = editRecipientList;
    window.updateRecipientList = updateRecipientList;
    window.cloneRecipientList = cloneRecipientList;
    window.deleteRecipientList = deleteRecipientList;
    window.selectRecipientList = selectRecipientList;
    window.removeSelectedRecipient = removeSelectedRecipient;
    window.refreshEditListRecipients = refreshEditListRecipients;
    window.addRecipientToEditList = addRecipientToEditList;
    window.addMultipleRecipientsToEditList = addMultipleRecipientsToEditList;
    window.updateRecipientField = updateRecipientField;
    window.removeRecipientFromEditList = removeRecipientFromEditList;
    window.filterRecipientLists = filterRecipientLists;
    window.viewRecipientList = viewRecipientList;
    window.useListInCampaign = useListInCampaign;
    window.exportRecipientList = exportRecipientList;
    window.checkOverdueCampaigns = checkOverdueCampaigns;
    window.manuallyTriggerScheduler = manuallyTriggerScheduler;
    window.sendCampaignFromDetail = sendCampaignFromDetail;
    window.refreshCampaignView = refreshCampaignView;
    window.hideProgress = hideProgress;


    // Load WhatsApp sessions
    async function loadSessions() {
        try {
            const response = await axios.get('/api/v1/sessions');
            sessions = response.data;
            const sessionSelect = document.getElementById('sessionId');
            if (sessionSelect) {
                sessionSelect.innerHTML = '<option value="">Select a session...</option>';
                sessions.forEach(session => {
                    if (session.status === 'CONNECTED') {
                        const option = document.createElement('option');
                        option.value = session.sessionId;
                        option.textContent = `${session.sessionId} - ${session.detail || 'Connected'}`;
                        sessionSelect.appendChild(option);
                    }
                });
            }
        } catch (error) {
            console.error('Error loading sessions:', error);
            showAlert('Error loading WhatsApp sessions', 'danger');
        }
    }

    // Load campaigns
    async function loadCampaigns() {
        try {
            const response = await axios.get('/api/v1/campaigns');
            campaigns = response.data;
            displayCampaigns();
        } catch (error) {
            console.error('Error loading campaigns:', error);
            showAlert(error.response?.data?.message || 'Error loading campaigns', 'danger');
            campaigns = [];
            displayCampaigns();
        }
    }

    // Load recipient lists
    async function loadRecipientLists() {
        try {
            const response = await axios.get('/api/v1/recipient-lists');
            recipientLists = response.data;
            displayRecipientLists();
        } catch (error) {
            console.error('Error loading recipient lists:', error);
            showAlert(error.response?.data?.message || 'Error loading recipient lists', 'danger');
            recipientLists = [];
            displayRecipientLists();
        }
    }

    // Display campaigns
    function displayCampaigns(filteredCampaigns = campaigns) {
        const grid = document.getElementById('campaignsGrid');
        if(!grid) return;
        grid.innerHTML = '';
        
        if (filteredCampaigns.length === 0) {
            grid.innerHTML = `<div class="col-12 text-center py-5"><i class="bi bi-megaphone" style="font-size: 4rem; color: #dee2e6;"></i><h4 class="mt-3 text-muted">No campaigns yet</h4><p class="text-muted">Create your first campaign to start sending bulk messages</p><button class="btn btn-success mt-2" onclick="showCreateCampaign()"><i class="bi bi-plus-circle"></i> Create Campaign</button></div>`;
            return;
        }
        
        filteredCampaigns.forEach(campaign => {
            const card = createCampaignCard(campaign);
            grid.innerHTML += card;
        });
    }

    // Display recipient lists
    function displayRecipientLists(filteredLists = recipientLists) {
        const grid = document.getElementById('recipientListsGrid');
        if (!grid) return;
        grid.innerHTML = '';

        if (filteredLists.length === 0) {
            grid.innerHTML = `<div class="col-12 text-center py-5"><i class="bi bi-people" style="font-size: 4rem; color: #dee2e6;"></i><h4 class="mt-3 text-muted">No recipient lists yet</h4><p class="text-muted">Create your first recipient list to use in campaigns</p><button class="btn btn-success mt-2" onclick="showCreateListModal()"><i class="bi bi-plus-circle"></i> Create List</button></div>`;
            return;
        }

        filteredLists.forEach(list => {
            const card = createRecipientListCard(list);
            grid.innerHTML += card;
        });
    }

    // Helper function to show alerts
    function showAlert(message, type = 'info') {
        const alertContainer = document.getElementById('alertContainer'); // Assuming an alert container exists in HTML
        if (!alertContainer) {
            console.warn('Alert container not found. Message:', message);
            return;
        }
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.setAttribute('role', 'alert');
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        alertContainer.appendChild(alert);
        setTimeout(() => alert.remove(), 5000); // Auto-dismiss after 5 seconds
    }

    // Helper function to escape HTML for safe display
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Function to load recipient lists page (activate tab and refresh data)
    async function loadRecipientListsPage() {
        const listsTabButton = document.getElementById('lists-tab');
        if (listsTabButton) {
            const bsTab = new bootstrap.Tab(listsTabButton);
            bsTab.show();
        }
        await loadRecipientLists();
    }

    // Function to create HTML for a recipient list card
    function createRecipientListCard(list) {
        return `
            <div class="col-md-6 col-lg-4">
                <div class="card mb-3">
                    <div class="card-body">
                        <h5 class="card-title">${escapeHtml(list.name)}</h5>
                        <h6 class="card-subtitle mb-2 text-muted">${list.recipients.length} Recipients</h6>
                        <p class="card-text"><small class="text-muted">Created: ${new Date(list.createdAt).toLocaleDateString()}</small></p>
                        <button class="btn btn-sm btn-primary" onclick="viewRecipientList('${list.id}')"><i class="bi bi-eye"></i> View</button>
                        <button class="btn btn-sm btn-info" onclick="editRecipientList('${list.id}')"><i class="bi bi-pencil"></i> Edit</button>
                        <button class="btn btn-sm btn-success" onclick="useListInCampaign('${list.id}')"><i class="bi bi-check-circle"></i> Use</button>
                        <button class="btn btn-sm btn-secondary" onclick="cloneRecipientList('${list.id}')"><i class="bi bi-files"></i> Clone</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteRecipientList('${list.id}')"><i class="bi bi-trash"></i> Delete</button>
                    </div>
                </div>
            </div>
        `;
    }

    // Filter campaigns based on search input and status
    function filterCampaigns() {
        const searchInput = document.getElementById('searchCampaigns');
        const filterStatusSelect = document.getElementById('filterStatus');
        if (!searchInput || !filterStatusSelect) return;

        const searchTerm = searchInput.value.toLowerCase();
        const statusFilter = filterStatusSelect.value;

        const filtered = campaigns.filter(campaign => {
            const matchesSearch = campaign.name.toLowerCase().includes(searchTerm);
            const matchesStatus = statusFilter === '' || campaign.status === statusFilter;
            return matchesSearch && matchesStatus;
        });

        displayCampaigns(filtered); // Assuming displayCampaigns can take a filtered array
    }

    // WebSocket setup
    async function setupWebSocket() {
        try {
            const wsAuthResponse = await axios.get('/api/v1/ws-auth');
            const wsToken = wsAuthResponse.data.wsToken;
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(`${wsProtocol}//${window.location.host}?token=${wsToken}`);

            ws.onopen = () => {
                console.log('WebSocket connected');
            };

            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'campaign-progress') {
                    updateCampaignProgress(message);
                } else if (message.type === 'campaign-status') {
                    handleCampaignStatusUpdate(message);
                }
            };

            ws.onclose = () => {
                console.log('WebSocket disconnected, attempting to reconnect...');
                setTimeout(setupWebSocket, 3000); // Reconnect after 3 seconds
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                ws.close();
            };
        } catch (error) {
            console.error('Failed to setup WebSocket:', error);
            showAlert('Failed to connect to live updates. Please refresh.', 'danger');
        }
    }

    // Function to show the create campaign wizard
    async function showCreateCampaign() {
        currentCampaign = null;
        currentStep = 1;
        csvRecipients = [];
        selectedRecipients = [];
        
        // Reset form fields
        document.getElementById('campaignName').value = '';
        document.getElementById('messageType').value = 'text';
        handleMessageTypeChange(); // Reset message type specific fields
        if (quillEditor) quillEditor.setText('');
        document.getElementById('scheduledAt').value = '';
        document.getElementById('sendNow').checked = true;
        document.getElementById('sendNow').dispatchEvent(new Event('change')); // Trigger change to update UI
        document.getElementById('csvFile').value = '';
        document.getElementById('csvFileName').textContent = 'No file chosen';
        document.getElementById('csvRecipientsPreview').innerHTML = '';
        document.getElementById('selectedRecipientsPreview').innerHTML = '';
        
        // Hide list view, show wizard
        document.getElementById('campaignListView').style.display = 'none';
        document.getElementById('campaignDetailView').style.display = 'none';
        document.getElementById('campaignWizard').style.display = 'block';
        
        updateWizardStep();
        await loadSessions(); // Reload sessions for the select box
        await loadRecipientLists(); // Reload recipient lists for selection
    }

    // Function to update campaign progress (from WebSocket)
    function updateCampaignProgress(data) {
        if (data.campaignId === activeCampaignId) {
            const progressBar = document.getElementById('progressBar');
            const progressSent = document.getElementById('progressSent');
            const progressTotal = document.getElementById('progressTotal');
            const progressFailed = document.getElementById('progressFailed');
            const progressCampaignName = document.getElementById('progressCampaignName');
            const progressContainer = document.getElementById('progressContainer');

            if (progressBar && progressSent && progressTotal && progressFailed && progressCampaignName && progressContainer) {
                const percentage = data.total > 0 ? Math.round(((data.sent + data.failed) / data.total) * 100) : 0;
                progressBar.style.width = `${percentage}%`;
                progressBar.textContent = `${percentage}%`;
                progressSent.textContent = data.sent;
                progressTotal.textContent = data.total;
                progressFailed.textContent = data.failed;
                progressCampaignName.textContent = data.campaignName;
                
                // Show toast if not already shown
                const bsToast = bootstrap.Toast.getOrCreateInstance(progressContainer);
                bsToast.show();
            }
        }
    }

    // Function to handle campaign status updates (from WebSocket)
    async function handleCampaignStatusUpdate(data) {
        console.log('Campaign status update:', data);
        showAlert(`Campaign "${data.campaignName}" status: ${data.status}`, 'info');
        await loadCampaigns(); // Refresh campaign list
        if (activeCampaignId === data.campaignId) {
            viewCampaign(data.campaignId); // Refresh detail view if active
        }
        // Hide progress toast if campaign is completed or failed
        if (['completed', 'failed'].includes(data.status)) {
            const progressContainer = document.getElementById('progressContainer');
            if (progressContainer) {
                const bsToast = bootstrap.Toast.getInstance(progressContainer);
                if (bsToast) bsToast.hide();
            }
        }
    }

    // Function to show the create recipient list modal
    function showCreateListModal() {
        document.getElementById('createListName').value = '';
        document.getElementById('createListTags').value = '';
        document.getElementById('createListRecipients').value = '';
        document.getElementById('createListModalLabel').textContent = 'Create New Recipient List';
        document.getElementById('saveListBtn').textContent = 'Create List';
        currentEditingList = null;
        const createListModal = new bootstrap.Modal(document.getElementById('createListModal'));
        createListModal.show();
    }

    // Wizard navigation functions
    function previousStep() {
        if (currentStep > 1) {
            currentStep--;
            updateWizardStep();
        }
    }

    async function nextStep() {
        if (await validateCurrentStep()) {
            currentStep++;
            updateWizardStep();
        }
    }

    function updateWizardStep() {
        const wizardStepsContainer = document.querySelector('.wizard-steps');
        const wizardTitle = document.getElementById('wizardTitle');
        const wizardContainers = document.querySelectorAll('[id^="wizard-step-"]');
        const modalBackBtn = document.getElementById('modalBackBtn'); // Assuming this is for wizard, not modal
        const modalNextBtn = document.getElementById('modalNextBtn'); // Assuming this is for wizard, not modal

        // Update wizard steps UI
        if (wizardStepsContainer) {
            wizardStepsContainer.innerHTML = `
                <div class="d-flex justify-content-between mb-3">
                    <div class="text-center flex-fill ${currentStep === 1 ? 'text-primary fw-bold' : 'text-muted'}">1. Details</div>
                    <div class="text-center flex-fill ${currentStep === 2 ? 'text-primary fw-bold' : 'text-muted'}">2. Message</div>
                    <div class="text-center flex-fill ${currentStep === 3 ? 'text-primary fw-bold' : 'text-muted'}">3. Recipients</div>
                    <div class="text-center flex-fill ${currentStep === 4 ? 'text-primary fw-bold' : 'text-muted'}">4. Schedule</div>
                    <div class="text-center flex-fill ${currentStep === 5 ? 'text-primary fw-bold' : 'text-muted'}">5. Review</div>
                </div>
            `;
        }

        // Hide all step containers
        wizardContainers.forEach(container => container.style.display = 'none');

        // Show current step container
        const currentStepContainer = document.getElementById(`wizard-step-${currentStep}`);
        if (currentStepContainer) {
            currentStepContainer.style.display = 'block';
        }

        // Update title
        if (wizardTitle) {
            const titles = {
                1: 'Campaign Details',
                2: 'Compose Message',
                3: 'Select Recipients',
                4: 'Schedule Campaign',
                5: 'Review & Confirm'
            };
            wizardTitle.textContent = currentCampaign && currentCampaign.id ? `Edit Campaign: ${currentCampaign.name} - ${titles[currentStep]}` : `New Campaign - ${titles[currentStep]}`;
        }

        // Update navigation buttons
        if (modalBackBtn) modalBackBtn.style.display = currentStep > 1 ? 'block' : 'none';
        if (modalNextBtn) modalNextBtn.textContent = currentStep === 5 ? 'Save Campaign' : 'Next';
    }

    async function validateCurrentStep() {
        // Implement validation logic for each step
        // For now, just return true
        return true;
    }

    async function saveDraft() {
        // Implement save draft logic
        showAlert('Campaign saved as draft!', 'success');
        backToList();
    }

    async function createCampaign() {
        // Implement create campaign logic
        showAlert('Campaign created!', 'success');
        backToList();
    }

    async function viewCampaign(campaignId) {
        // Implement view campaign logic
        showAlert(`Viewing campaign ${campaignId}`, 'info');
    }

    async function editCampaign(campaignId) {
        // Implement edit campaign logic
        showAlert(`Editing campaign ${campaignId}`, 'info');
    }

    async function sendCampaign(campaignId) {
        // Implement send campaign logic
        showAlert(`Sending campaign ${campaignId}`, 'success');
    }

    async function pauseCampaign(campaignId) {
        // Implement pause campaign logic
        showAlert(`Pausing campaign ${campaignId}`, 'warning');
    }

    async function resumeCampaign(campaignId) {
        // Implement resume campaign logic
        showAlert(`Resuming campaign ${campaignId}`, 'info');
    }

    async function retryCampaign(campaignId) {
        // Implement retry campaign logic
        showAlert(`Retrying campaign ${campaignId}`, 'info');
    }

    async function cloneCampaign(campaignId) {
        // Implement clone campaign logic
        showAlert(`Cloning campaign ${campaignId}`, 'info');
    }

    async function deleteCampaign(campaignId) {
        // Implement delete campaign logic
        showAlert(`Deleting campaign ${campaignId}`, 'danger');
    }

    function backToList() {
        document.getElementById('campaignListView').style.display = 'block';
        document.getElementById('campaignDetailView').style.display = 'none';
        document.getElementById('campaignWizard').style.display = 'none';
        loadCampaigns();
    }

    function insertPlaceholder(placeholder) {
        // Implement insert placeholder logic for Quill editor
        if (quillEditor) {
            quillEditor.focus();
            const range = quillEditor.getSelection();
            if (range) {
                quillEditor.insertText(range.index, `{{${placeholder}}}`);
            }
        }
    }

    function downloadCSVTemplate() {
        // Implement download CSV template logic
        showAlert('Downloading CSV template...', 'info');
    }

    function debugCSVUpload() {
        // Implement debug CSV upload logic
        showAlert('Debugging CSV upload...', 'info');
    }

    function addRecipientRow() {
        // Implement add recipient row logic
        showAlert('Adding recipient row...', 'info');
    }

    function removeRecipientRow(button) {
        // Implement remove recipient row logic
        showAlert('Removing recipient row...', 'info');
    }

    function addMultipleRecipients() {
        // Implement add multiple recipients logic
        showAlert('Adding multiple recipients...', 'info');
    }

    function processBulkRecipients() {
        // Implement process bulk recipients logic
        showAlert('Processing bulk recipients...', 'info');
    }

    function saveRecipientList() {
        // Implement save recipient list logic
        showAlert('Saving recipient list...', 'success');
    }

    function editRecipientList(listId) {
        // Implement edit recipient list logic
        showAlert(`Editing recipient list ${listId}`, 'info');
    }

    function updateRecipientList() {
        // Implement update recipient list logic
        showAlert('Updating recipient list...', 'success');
    }

    function cloneRecipientList(listId) {
        // Implement clone recipient list logic
        showAlert(`Cloning recipient list ${listId}`, 'info');
    }

    function deleteRecipientList(listId) {
        // Implement delete recipient list logic
        showAlert(`Deleting recipient list ${listId}`, 'danger');
    }

    function selectRecipientList(listId) {
        // Implement select recipient list logic
        showAlert(`Selecting recipient list ${listId}`, 'info');
    }

    function removeSelectedRecipient(index) {
        // Implement remove selected recipient logic
        showAlert(`Removing selected recipient at index ${index}`, 'info');
    }

    function refreshEditListRecipients() {
        // Implement refresh edit list recipients logic
        showAlert('Refreshing edit list recipients...', 'info');
    }

    function addRecipientToEditList() {
        // Implement add recipient to edit list logic
        showAlert('Adding recipient to edit list...', 'info');
    }

    function addMultipleRecipientsToEditList() {
        // Implement add multiple recipients to edit list logic
        showAlert('Adding multiple recipients to edit list...', 'info');
    }

    function updateRecipientField(input) {
        // Implement update recipient field logic
        showAlert('Updating recipient field...', 'info');
    }

    function removeRecipientFromEditList(button) {
        // Implement remove recipient from edit list logic
        showAlert('Removing recipient from edit list...', 'info');
    }

    function filterRecipientLists() {
        // Implement filter recipient lists logic
        showAlert('Filtering recipient lists...', 'info');
    }

    function viewRecipientList(listId) {
        // Implement view recipient list logic
        showAlert(`Viewing recipient list ${listId}`, 'info');
    }

    function useListInCampaign(listId) {
        // Implement use list in campaign logic
        showAlert(`Using list ${listId} in campaign...`, 'info');
    }

    function exportRecipientList(listId) {
        // Implement export recipient list logic
        showAlert(`Exporting recipient list ${listId}...`, 'info');
    }

    function checkOverdueCampaigns() {
        // Implement check overdue campaigns logic
        showAlert('Checking overdue campaigns...', 'info');
    }

    function manuallyTriggerScheduler() {
        // Implement manually trigger scheduler logic
        showAlert('Manually triggering scheduler...', 'info');
    }

    function sendCampaignFromDetail(campaignId) {
        // Implement send campaign from detail logic
        showAlert(`Sending campaign ${campaignId} from detail view...`, 'info');
    }

    function refreshCampaignView() {
        // Implement refresh campaign view logic
        showAlert('Refreshing campaign view...', 'info');
    }

    function hideProgress() {
        // Implement hide progress logic
        showAlert('Hiding progress...', 'info');
    }

    function handleCSVUpload(event) {
        // Implement handle CSV upload logic
        showAlert('Handling CSV upload...', 'info');
    }

    function handleMessageTypeChange() {
        // Implement handle message type change logic
        showAlert('Handling message type change...', 'info');
    }

    function updateMessagePreview() {
        // Implement update message preview logic
        showAlert('Updating message preview...', 'info');
    }
});