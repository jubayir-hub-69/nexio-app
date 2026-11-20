// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title Nexio Enterprise Address Book & Recipient Whitelist
/// @notice Wallet-scoped on-chain contact registry supporting 0x addresses, .nex domains, and institutional labels.
contract NexioAddressBook {
    struct Contact {
        address recipient;
        string label;
        string domain;
        uint64 addedAt;
        uint64 updatedAt;
        bool exists;
    }

    uint256 public constant MAX_CONTACTS_PER_WALLET = 100;

    mapping(address => address[]) private _contactOrder;
    mapping(address => mapping(address => uint256)) private _indexPlusOne;
    mapping(address => mapping(address => Contact)) private _contacts;

    event ContactSaved(
        address indexed owner,
        address indexed recipient,
        string label,
        string domain,
        uint64 timestamp
    );
    event ContactRemoved(
        address indexed owner,
        address indexed recipient,
        uint64 timestamp
    );

    /// @notice Saves or updates a whitelisted contact scoped strictly to msg.sender.
    function saveContact(
        address recipient,
        string calldata label,
        string calldata domain
    ) external {
        require(recipient != address(0), "Zero recipient");
        require(bytes(label).length > 0 && bytes(label).length <= 64, "Invalid label length");
        require(bytes(domain).length <= 68, "Invalid domain length");

        uint64 nowTs = uint64(block.timestamp);
        Contact storage entry = _contacts[msg.sender][recipient];

        if (!entry.exists) {
            require(_contactOrder[msg.sender].length < MAX_CONTACTS_PER_WALLET, "Address book full");
            _contactOrder[msg.sender].push(recipient);
            _indexPlusOne[msg.sender][recipient] = _contactOrder[msg.sender].length;
            entry.recipient = recipient;
            entry.addedAt = nowTs;
            entry.exists = true;
        }

        entry.label = label;
        entry.domain = domain;
        entry.updatedAt = nowTs;

        emit ContactSaved(msg.sender, recipient, label, domain, nowTs);
    }

    /// @notice Permanently removes a contact from msg.sender's address book in O(1) storage writes.
    function removeContact(address recipient) external {
        uint256 idxPlusOne = _indexPlusOne[msg.sender][recipient];
        require(idxPlusOne > 0, "Contact not found");

        uint256 idx = idxPlusOne - 1;
        address[] storage list = _contactOrder[msg.sender];
        uint256 lastIdx = list.length - 1;

        if (idx != lastIdx) {
            address moved = list[lastIdx];
            list[idx] = moved;
            _indexPlusOne[msg.sender][moved] = idx + 1;
        }

        list.pop();
        delete _indexPlusOne[msg.sender][recipient];
        delete _contacts[msg.sender][recipient];

        emit ContactRemoved(msg.sender, recipient, uint64(block.timestamp));
    }

    /// @notice Returns every saved contact for a given owner wallet in a single RPC call.
    function getContacts(address owner) external view returns (Contact[] memory) {
        address[] storage list = _contactOrder[owner];
        uint256 len = list.length;
        Contact[] memory result = new Contact[](len);
        for (uint256 i = 0; i < len; i++) {
            result[i] = _contacts[owner][list[i]];
        }
        return result;
    }

    function getContactCount(address owner) external view returns (uint256) {
        return _contactOrder[owner].length;
    }

    function isWhitelisted(address owner, address recipient) external view returns (bool) {
        return _contacts[owner][recipient].exists;
    }
}
