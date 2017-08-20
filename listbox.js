'use strict';

const React = require('react');

class ListBox extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			selectedIndex: -1
		};
		this.container = null;
		this.onKeydown = event => {
			const items = this.props.items || [];
			let selectedIndex = this.state.selectedIndex;
			switch (event.key) {
				case 'ArrowDown':
					selectedIndex++;
					break;
				case 'ArrowUp':
					selectedIndex--;
					break;
				case 'End':
					selectedIndex = items.length - 1;
					break;
				case 'Home':
					selectedIndex = 0;
					break;
				// case 'PageDown':
				// case 'PageUp':
				case ' ':
					this.props.onToggled(selectedIndex);
					event.preventDefault();
					break;
				default:
					break;
			}
			selectedIndex = Math.max(0, Math.min(items.length - 1, selectedIndex));
			if (selectedIndex !== this.state.selectedIndex) {
				this.setSelectedIndex(selectedIndex);
				event.preventDefault();
			}
		};
	}

	componentDidMount() {
		window.addEventListener('keydown', this.onKeydown); // this.container
	}
	componentWillUnmount() {
		window.removeEventListener('keydown', this.onKeydown); // this.container
	}
	componentWillUpdate(nextProps) {
		const items = nextProps.items || [];
		if ((this.state.selectedIndex === -1) && (items.length > 0)) {
			this.setSelectedIndex(0);
		} else if ((this.state.selectedIndex !== -1) && (items.length === 0)) {
			this.setSelectedIndex(-1);
		}
	}

	render() {
		const items = this.props.items || [];
		const selectedIndex = this.state.selectedIndex;
		return React.createElement(
			'ul', {
				className: this.props.containerClass,
				ref: element => {
					this.container = element;
				}
			},
			items.map((item, index) =>
				React.createElement(
					'li', {
						key: this.props.keyForItem(item),
						className: this.props.itemClass + ((selectedIndex === index) ? ` ${this.props.selectedItemClass}` : ''),
						onClick: () => {
							this.setSelectedIndex(index);
						},
						ref: (selectedIndex === index) ? element => {
							if (element) {
								element.scrollIntoViewIfNeeded();
							}
						} : null
					},
					this.props.elementForItem(item, index)
				)
			)
		);
	}

	setSelectedIndex(selectedIndex) {
		this.setState({
			selectedIndex
		});
		this.props.onSelected(selectedIndex);
	}
}

module.exports = ListBox;
