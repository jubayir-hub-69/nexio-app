// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title NEX Name Service
 * @dev On-chain .nex domain registry
 * Build by JUBAYIR69
 */
contract NexNameService {
    // Domain name => wallet address
    mapping(string => address) private _resolveName;

    // Domain name => whether registered
    mapping(string => bool) private _isRegistered;

    // Wallet address => domain name
    mapping(address => string) private _reverseResolve;

    // Wallet address => whether already owns a domain
    mapping(address => bool) private _hasDomain;

    event DomainRegistered(
        string indexed name,
        address indexed owner
    );

    /**
     * @dev Register a new .nex domain
     * @param _name Domain name without .nex suffix
     * Example: "jubayir"
     */
    function register(string memory _name) external {
        require(bytes(_name).length > 0, "NEX: Name cannot be empty");
        require(!_isRegistered[_name], "NEX: Domain already taken");
        require(!_hasDomain[msg.sender], "NEX: Address already has a domain");

        // Save forward resolution
        _isRegistered[_name] = true;
        _resolveName[_name] = msg.sender;

        // Save reverse resolution
        _reverseResolve[msg.sender] = _name;
        _hasDomain[msg.sender] = true;

        emit DomainRegistered(_name, msg.sender);
    }

    /**
     * @dev Resolve .nex domain to wallet address
     * @param _name Domain name without .nex
     */
    function resolve(string memory _name)
        external
        view
        returns (address)
    {
        require(
            _isRegistered[_name],
            "NEX: Domain not found"
        );

        return _resolveName[_name];
    }

    /**
     * @dev Reverse resolve wallet address to .nex domain
     * @param _owner Wallet address
     */
    function resolveByAddress(address _owner)
        external
        view
        returns (string memory)
    {
        require(
            _hasDomain[_owner],
            "NEX: No domain found for address"
        );

        return _reverseResolve[_owner];
    }

    /**
     * @dev Check whether a domain is available
     * @param _name Domain name without .nex
     */
    function isAvailable(string memory _name)
        external
        view
        returns (bool)
    {
        return !_isRegistered[_name];
    }

    /**
     * @dev Check whether an address already owns a domain
     * @param _owner Wallet address
     */
    function hasDomain(address _owner)
        external
        view
        returns (bool)
    {
        return _hasDomain[_owner];
    }

    /**
     * @dev Get the full .nex domain for an address
     * Example: "jubayir.nex"
     */
    function getFullDomain(address _owner)
        external
        view
        returns (string memory)
    {
        require(
            _hasDomain[_owner],
            "NEX: No domain found for address"
        );

        return string(
            abi.encodePacked(
                _reverseResolve[_owner],
                ".nex"
            )
        );
    }
}